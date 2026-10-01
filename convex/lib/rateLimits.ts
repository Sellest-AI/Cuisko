import { DAY, HOUR, type RateLimitConfig } from "@convex-dev/rate-limiter";

/**
 * How often one cook may make each kind of costly call: a model, or an upload. The only place a number lives: changing a
 * limit is a one-line diff here and nothing else moves.
 *
 * Two shapes, picked by how the call is used:
 *
 *  - **Token bucket** for what a cook does in bursts (a conversation, a shopping list). `capacity`
 *    is the burst, `rate` per `period` is the long-run speed, and tokens return one at a time.
 *  - **Fixed window** for a daily budget (a recipe written or imported). The window starts at a
 *    random offset per user, so "10 a day" does not reset at midnight.
 */
export const RATE_LIMITS = {
  assistant: { kind: "token bucket", rate: 50, period: 6 * HOUR, capacity: 20 },
  assistantClassify: { kind: "token bucket", rate: 80, period: 6 * HOUR, capacity: 40 },
  ingredientResolve: { kind: "token bucket", rate: 90, period: 6 * HOUR, capacity: 30 },
  recipeWrite: { kind: "fixed window", rate: 10, period: DAY },
  recipeImport: { kind: "fixed window", rate: 10, period: DAY },
  // The photos a cook sends with a question: today the only thing uploaded, so it copies `assistant`.
  imageUpload: { kind: "token bucket", rate: 50, period: 6 * HOUR, capacity: 20 },
} as const satisfies Record<string, RateLimitConfig>;

export type RateLimitKind = keyof typeof RATE_LIMITS;

/** Admins get the same shape scaled up, never exempt: a leaked admin session stays bounded. */
export const ADMIN_MULTIPLIER = 10;

/** The limit one caller is held to for `kind`. */
export const rateLimitFor = (kind: RateLimitKind, isAdmin: boolean): RateLimitConfig => {
  const config: RateLimitConfig = RATE_LIMITS[kind];
  if (!isAdmin) return config;

  return {
    ...config,
    rate: config.rate * ADMIN_MULTIPLIER,
    ...(config.capacity === undefined ? {} : { capacity: config.capacity * ADMIN_MULTIPLIER }),
  };
};
