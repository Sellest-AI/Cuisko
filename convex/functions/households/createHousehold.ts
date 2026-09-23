import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";

import { generateInviteCode } from "./inviteCode";

type CreateCtx = Pick<MutationCtx, "db">;

/** Every new household starts with this name. One word, not translated: the cook renames it. */
const DEFAULT_NAME = "House";

/**
 * A new household with its first member.
 *
 * It never touches `currentHouseholdId`, and that is what lets sign-up call it: the account's
 * `usersExtended` row does not exist yet when this runs, so sign-up writes the returned id into
 * that row's insert, and `router/households/create` selects it afterwards.
 */
export const createHousehold = async (
  ctx: CreateCtx,
  userId: Id<"users">,
): Promise<Id<"households">> => {
  const householdId = await ctx.db.insert("households", {
    name: DEFAULT_NAME,
    inviteCode: await generateInviteCode(ctx),
    updatedAt: Date.now(),
  });

  await ctx.db.insert("householdUsers", { householdId, userId });

  return householdId;
};
