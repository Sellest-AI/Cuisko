import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";

import { api } from "../../../../_generated/api";
import { registerRateLimiter, rateLimitedCook, warmRateLimiter } from "../../../../lib/__tests__/rateLimiterTest";
import schema from "../../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/**
 * Imports the module under test before any test is timed, so the first one is not billed for the
 * backend graph beneath it against Vitest's 5s timeout. See router/ingredients/__tests__/resolve.test.ts
 * for the measurement. Stops at the `.` so a `"use node"` sibling stays out.
 */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/media/images/uploadOne."))
      .map(([, load]) => load()),
  ).then(warmRateLimiter),
);

/**
 * Only the gate is exercised here. Past it, `uploadOne` delegates to the `uploadMany` action,
 * which fetches bytes, runs `sharp` and writes to S3 — none of which belongs in a unit test, and
 * none of which is reached by an unauthenticated caller. The rejection happens in the builder,
 * before the handler body runs, which is exactly what makes it assertable without any of that.
 */
describe("router/media/images/uploadOne", () => {
  test("`authed` rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.action(api.router.media.images.uploadOne.authed, { url: "https://cdn.test/a.webp" }),
    ).rejects.toThrow();
  });

  test("`authed` rejects an identity that resolves to no user", async () => {
    const t = convexTest(schema, modules);

    // A well-formed subject for a user row that does not exist — the shape a stale token has.
    await expect(
      t
        .withIdentity({ subject: "k1000000000000000000000000000000|test-session" })
        .action(api.router.media.images.uploadOne.authed, { url: "https://cdn.test/a.webp" }),
    ).rejects.toThrow();
  });

  test("refuses a cook who has hit their rate limit, before any work, leaving no rows behind", async () => {
    const t = convexTest(schema, modules);
    registerRateLimiter(t);
    const { cook } = await rateLimitedCook(t, "imageUpload");

    await expect(cook.action(api.router.media.images.uploadOne.authed, { base64: "AAAA" })).rejects.toMatchObject({
      data: { code: "RATE_LIMITED" },
    });

    expect(await t.run((ctx) => ctx.db.query("images").collect())).toEqual([]);
  });

  test("rejects before doing any work, leaving no rows behind", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.action(api.router.media.images.uploadOne.authed, { base64: "AAAA" }),
    ).rejects.toThrow();

    await t.run(async (ctx) => {
      expect(await ctx.db.query("images").collect()).toEqual([]);
    });
  });
});
