import { components } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError } from "convex/values";

import { type RateLimitKind, rateLimitFor } from "../../lib/rateLimits";
import type { AppUser } from "../users/loadUser";

const limiter = new RateLimiter(components.rateLimiter);

/** A mutation ctx or an action ctx: all the limiter needs is `runMutation`. */
type RateLimitCtx = Parameters<RateLimiter["limit"]>[0] & {
  userId: Id<"users">;
  user: Pick<AppUser, "role">;
};

/**
 * Rate limits one cook's use of one kind of costly call (a model, an upload): takes a token from their allowance for `kind`,
 * or refuses.
 *
 * Called first in every `authed` handler that reaches a model or storage (C16 fails the commit otherwise), so
 * a refused call has done nothing. In a mutation the token is taken in the same transaction as the
 * write and a refusal rolls both back; in an action taking it is its own committed step, and a call
 * that takes a token and then fails is not refunded.
 *
 * @limitation No refund when the work fails after the token is taken. A model outage costs the cook
 * part of their allowance, which the limits are generous enough to absorb.
 *
 * `count` is how many calls this one stands for, so a batch takes a token per item and one request
 * cannot carry a hundred of them past a limit meant for one.
 *
 * Throws `ConvexError({ code: "RATE_LIMITED" })` and nothing else: the limit that was hit and the
 * time it resets are not ours to tell a caller who may be probing for them.
 */
export const enforceRateLimit = async (ctx: RateLimitCtx, kind: RateLimitKind, count = 1): Promise<void> => {
  const isAdmin = ctx.user.role === "ADMIN";
  const config = rateLimitFor(kind, isAdmin);

  // A batch bigger than the whole bucket can never pass, and the limiter would answer with a plain
  // error that names the capacity. It is refused here, as bare as any other refusal.
  if (count > (config.capacity ?? config.rate)) throw new ConvexError({ code: "RATE_LIMITED" });

  const status = await limiter.limit(ctx, `limit:${kind}${isAdmin ? ":admin" : ""}`, {
    key: ctx.userId,
    config,
    count,
  });

  if (!status.ok) throw new ConvexError({ code: "RATE_LIMITED" });
};

/**
 * `run`, behind the rate limit: for the `authed` export whose whole body is one call, so the router
 * file gains an import and no lines (C2 caps it, and C16 accepts this as the guard).
 *
 * A thunk rather than a wrapper around the handler, on purpose: wrapping the handler makes the
 * builder's contextual typing of `ctx` and `args` unreachable, and they arrive as `unknown`.
 */
export const withRateLimit = async <Result>(
  ctx: RateLimitCtx,
  kind: RateLimitKind,
  run: () => Promise<Result>,
): Promise<Result> => {
  await enforceRateLimit(ctx, kind);

  return run();
};
