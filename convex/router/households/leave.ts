import { leaveHousehold } from "@convex/functions/households/leaveHousehold";
import { householdMutation } from "@convex/procedures";

/**
 * Leaves a household. `householdMutation` proves the caller is in it before the handler runs.
 * Leaving your only household throws `LAST_HOUSEHOLD`.
 */
export const authed = householdMutation({
  args: {},
  handler: (ctx) => leaveHousehold(ctx, ctx.user, ctx.householdId),
});
