import { convexTest } from "convex-test";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "../../../_generated/api";
import schema from "../../../schema";
import { registerRateLimiter, rateLimitedCook, warmRateLimiter } from "../../../lib/__tests__/rateLimiter.fixtures";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** Where a recorded call ends up. Mocked so a test can read the events and nothing is scheduled. */
const capture = vi.hoisted(() => vi.fn());
vi.mock("@convex/lib/posthog/client", () => ({ posthog: { capture } }));

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

let t: ReturnType<typeof convexTest>;

/** A whole identity: `loadUser` treats a `users` row with no `usersExtended` as a half-account. */
const signIn = async () => {
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", { name: "Franck", email: "f@example.com" });
    await ctx.db.insert("usersExtended", { userId: id, role: "USER", updatedAt: Date.now() });

    return id;
  });

  return t.withIdentity(asUser(userId));
};

/**
 * The module graph this file exercises, imported before anything is timed — C10 rule 4.
 *
 * `import.meta.glob` hands convex-test lazy loaders, so without this the first test in the file pays
 * to instantiate the router and everything under it, and that test is an authorization rejection
 * that should cost microseconds. Narrow on purpose: warming the whole glob imports the entire
 * backend into every file that globs it.
 */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/assistant/classify"))
      .map(([, load]) => load()),
  ).then(warmRateLimiter),
);

beforeEach(() => {
  t = convexTest(schema, modules);
  registerRateLimiter(t);
  capture.mockReset();
});

/** What TypeSafe answers, as the transport expects to read it. */
const answering = (choice: "ingredient" | "recipe" | "request", confidence: number) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            model: "typesafe/jev-1.13",
            answers: {
              intent: { type: "choice", choice, probabilities: { [choice]: confidence }, confidence },
            },
            usage: { input_tokens: 380, output_tokens: 9, cost: 0.000027 },
          }),
        ),
    ),
  );

describe("router/assistant/classify", () => {
  /**
   * The gate. This action spends money on a third party, so the rejection has to happen in the
   * procedure wrapper — before the request goes out, not after it is paid for.
   */
  test("rejects an unauthenticated caller", async () => {
    await expect(t.action(api.router.assistant.classify.authed, { text: "yuzu", locale: "fr" })).rejects.toThrow();
  });

  test("rejects an authenticated caller who is not a known user", async () => {
    const ghost = await t.run((ctx) => ctx.db.insert("users", { name: "Ghost" }));
    await t.run((ctx) => ctx.db.delete(ghost));

    await expect(
      t.withIdentity(asUser(ghost)).action(api.router.assistant.classify.authed, { text: "yuzu", locale: "fr" }),
    ).rejects.toThrow();
  });

  test("refuses a caller who has hit their rate limit, before any request goes out", async () => {
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);
    const { cook } = await rateLimitedCook(t, "assistantClassify");

    await expect(cook.action(api.router.assistant.classify.authed, { text: "yuzu", locale: "fr" })).rejects.toMatchObject({
      data: { code: "RATE_LIMITED" },
    });
    expect(fetched).not.toHaveBeenCalled();
  });

  /**
   * A round trip through the real validator, which is the other half of this file's job: `returns:
   * vIntent` is checked by Convex at runtime, so a reason the validator does not know would be
   * rejected here rather than in front of a shopper.
   */
  test("hands a signed-in caller the intent the model settled on", async () => {
    answering("request", 0.94);

    await expect(
      (await signIn()).action(api.router.assistant.classify.authed, { text: "calories pomme golden", locale: "fr" }),
    ).resolves.toEqual({ kind: "chat", reason: "model" });
  });

  /** What PostHog averages for this route: the one Jev call, billed, filed under it, for the cook. */
  test("records the judgment it paid for under assistant/classify, for the cook", async () => {
    answering("request", 0.94);
    const cook = await signIn();

    await cook.action(api.router.assistant.classify.authed, { text: "calories pomme golden", locale: "fr" });

    const [userId] = await t.run(async (ctx) => (await ctx.db.query("users").collect()).map((user) => user._id));
    expect(capture).toHaveBeenCalledOnce();
    expect(capture.mock.calls[0]![1]).toMatchObject({
      event: "$ai_generation",
      distinctId: userId,
      properties: { operation: "assistant/classify", $ai_span_name: "jev.intent", $ai_total_cost_usd: 0.000027 },
    });
  });

  test("has no opinion when the judgment cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("no network in tests"))));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      (await signIn()).action(api.router.assistant.classify.authed, { text: "yuzu", locale: "fr" }),
    ).resolves.toEqual({ kind: "unknown" });
    expect(logged).toHaveBeenCalled();
  });
});
