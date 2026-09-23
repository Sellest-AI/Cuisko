import { selectHousehold } from "@convex/functions/households/selectHousehold";
import { householdMutation } from "@convex/procedures";

/**
 * Makes a household the one the app shops for. `householdMutation` proves the caller belongs to it,
 * so nobody can point their account at a kitchen they are not in.
 */
export const authed = householdMutation({
  args: {},
  handler: (ctx) => selectHousehold(ctx, ctx.user, ctx.householdId),
});
