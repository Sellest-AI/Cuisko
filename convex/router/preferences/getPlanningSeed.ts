import { getPlanningSeed } from "@convex/functions/preferences/getPlanningSeed";
import { householdQuery } from "@convex/procedures";

/**
 * Everything the planning tunnel opens with: the caller's own preferences, the union of their
 * housemates', and the household's kitchen and plan defaults.
 *
 * `householdQuery` rather than `authQuery`, and that is the authorization: this reads other
 * members' rows, so membership of the household being asked about is exactly the right to see
 * them. `ctx.userId` is the caller's own — never an argument — so `others` cannot be recentred on
 * somebody else by a client that asks nicely.
 *
 * It returns their constraints and never their identity. See `getPlanningSeed` for why that line
 * is where it is.
 */
export const authed = householdQuery({
  args: {},
  handler: (ctx) => getPlanningSeed(ctx, ctx.householdId, ctx.userId),
});
