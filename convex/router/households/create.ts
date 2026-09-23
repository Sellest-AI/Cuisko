import { createHousehold } from "@convex/functions/households/createHousehold";
import { selectHousehold } from "@convex/functions/households/selectHousehold";
import { authMutation } from "@convex/procedures";

/**
 * A new household with the caller as its only member, and the one the app now shops for.
 *
 * No arguments: the member is `ctx.user`, and the name is the default every household starts with.
 */
export const authed = authMutation({
  args: {},
  handler: async (ctx) => {
    const householdId = await createHousehold(ctx, ctx.userId);
    await selectHousehold(ctx, ctx.user, householdId);
    return householdId;
  },
});
