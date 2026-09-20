import { convexTest } from "convex-test";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "../../../_generated/api";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

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
  ),
);

beforeEach(() => {
  t = convexTest(schema, modules);
});

/** What TypeSafe answers, as the transport expects to read it. */
const answering = (choice: "ingredient" | "recipe" | "request", confidence: number) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            answers: {
              intent: { type: "choice", choice, probabilities: { [choice]: confidence }, confidence },
            },
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

  test("has no opinion when the judgment cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("no network in tests"))));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      (await signIn()).action(api.router.assistant.classify.authed, { text: "yuzu", locale: "fr" }),
    ).resolves.toEqual({ kind: "unknown" });
    expect(logged).toHaveBeenCalled();
  });
});
