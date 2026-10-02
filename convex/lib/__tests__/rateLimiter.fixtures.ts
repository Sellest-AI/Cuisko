import type { RateLimitConfig } from "@convex-dev/rate-limiter";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import type { convexTest } from "convex-test";

import { enforceRateLimit } from "../../functions/rateLimits/enforceRateLimit";
import { type RateLimitKind, RATE_LIMITS } from "../rateLimits";

// The second dot in this file's name is load-bearing: the Convex CLI pushes every `convex/` file whose
// name has a single dot, and `@convex-dev/rate-limiter/test` uses `import.meta`, which fails the deploy.

type ConvexTest = ReturnType<typeof convexTest>;

/**
 * What every test that reaches `enforceRateLimit` needs, written once: `authed` handlers that are rate limited call the
 * rate limiter component, and convex-test only knows the components it is told about.
 */
export const registerRateLimiter = (t: Parameters<typeof rateLimiterTest.register>[0]) =>
  rateLimiterTest.register(t);

/**
 * The component's own functions, imported before anything is timed — C10 rule 4. They are a second
 * lazy glob that `register` hands to convex-test as-is, so the first call would otherwise pay for
 * the whole graph against its own timeout. `convex.config.ts` is left out: it calls
 * `component.use`, which only runs in the Convex runtime.
 */
export const warmRateLimiter = () =>
  Promise.all(
    Object.entries(rateLimiterTest.modules)
      .filter(([path]) => !path.includes("convex.config"))
      .map(([, load]) => load()),
  );

/**
 * A signed-in cook who has already used up `kind`'s whole allowance, so the next `authed` call is the
 * one the limiter refuses. Drained through `enforceRateLimit` itself rather than by calling the endpoint
 * `capacity` times, which would run the model mocks that many times to prove nothing about them.
 * `used` takes fewer tokens than that, for the cook who is not yet out but about to be.
 */
export const rateLimitedCook = async (t: ConvexTest, kind: RateLimitKind, used?: number) => {
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", { name: "Franck", email: "f@example.com" });
    await ctx.db.insert("usersExtended", { userId: id, role: "USER", updatedAt: Date.now() });

    return id;
  });

  const limit: RateLimitConfig = RATE_LIMITS[kind];
  for (let spent = 0; spent < (used ?? limit.capacity ?? limit.rate); spent++) {
    await t.run((ctx) => enforceRateLimit({ ...ctx, userId, user: { role: "USER" } }, kind));
  }

  // `@convex-dev/auth` encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half.
  return { userId, cook: t.withIdentity({ subject: `${userId}|test-session` }) };
};
