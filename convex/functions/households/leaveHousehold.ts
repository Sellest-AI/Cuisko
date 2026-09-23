import { ConvexError } from "convex/values";

import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";

import type { AppUser } from "../users/loadUser";
import { selectHousehold } from "./selectHousehold";

type LeaveCtx = Pick<MutationCtx, "db">;

/**
 * Takes the caller out of `householdId`, and remembers that they were there.
 *
 * - Your only household cannot be left (`LAST_HOUSEHOLD`): every screen past the home one is scoped
 *   by a household, and a cook with none has nowhere to shop.
 * - The membership becomes a `householdFormerMembers` row, in the same mutation: at most one per
 *   person, which `join` clears when they come back.
 * - The last member out deletes nothing. The household, its cellar, its plans and its history stay
 *   as an archive; only its code is cleared, so nobody holding an old one can walk back in.
 * - If it was the household the app was shopping for, the caller's oldest remaining one takes over.
 *
 * Membership is the caller's to have proved: the router is a `householdMutation`.
 */
export const leaveHousehold = async (
  ctx: LeaveCtx,
  user: Pick<AppUser, "_id" | "_idExtended" | "currentHouseholdId">,
  householdId: Id<"households">,
): Promise<void> => {
  const memberships = await ctx.db
    .query("householdUsers")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();

  const leaving = memberships.find((membership) => membership.householdId === householdId);
  const remaining = memberships.filter((membership) => membership.householdId !== householdId);

  if (!leaving) throw new ConvexError({ code: "FORBIDDEN" });
  if (remaining.length === 0) throw new ConvexError({ code: "LAST_HOUSEHOLD" });

  await ctx.db.delete(leaving._id);

  // `join` deletes this row on the way back in, so one is never already here; checked anyway,
  // because a second row for the same person is the duplicate the table is shaped to prevent.
  const alreadyFormer = await ctx.db
    .query("householdFormerMembers")
    .withIndex("by_household_and_user", (q) => q.eq("householdId", householdId).eq("userId", user._id))
    .first();

  if (!alreadyFormer) await ctx.db.insert("householdFormerMembers", { householdId, userId: user._id });

  const anyoneLeft = await ctx.db
    .query("householdUsers")
    .withIndex("by_household", (q) => q.eq("householdId", householdId))
    .first();

  if (!anyoneLeft) await ctx.db.patch(householdId, { inviteCode: undefined, updatedAt: Date.now() });

  // `remaining` keeps `by_user`'s order, oldest membership first. Checked non-empty above.
  const fallback = remaining[0];
  const isShoppingHere = !user.currentHouseholdId || user.currentHouseholdId === householdId;

  if (fallback && isShoppingHere) await selectHousehold(ctx, user, fallback.householdId);
};
