import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";

import type { AppUser } from "../users/loadUser";

type SelectCtx = Pick<MutationCtx, "db">;

/**
 * Makes `householdId` the one the app shops for.
 *
 * Membership is the caller's to have proved: `router/households/select` gets it from
 * `householdMutation`, and `create` / `join` have just written it themselves.
 */
export const selectHousehold = async (
  ctx: SelectCtx,
  user: Pick<AppUser, "_idExtended">,
  householdId: Id<"households">,
): Promise<void> => {
  await ctx.db.patch(user._idExtended, { currentHouseholdId: householdId, updatedAt: Date.now() });
};
