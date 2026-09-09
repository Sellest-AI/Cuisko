import { getForUser } from "@convex/functions/preferences/getForUser";
import { authQuery } from "@convex/procedures";

/**
 * The caller's own saved preferences, or `null` if they have never answered.
 *
 * Takes no argument, for the reason `households/getMine` takes none: the only identity it could be
 * asked about is the one it already holds, and accepting a `userId` here would be the
 * impersonation hole `authQuery` exists to close. Another member's constraints are reachable only
 * through the household aggregate, which returns their union and never says whose.
 */
export const authed = authQuery({
  args: {},
  handler: (ctx) => getForUser(ctx, ctx.userId),
});
