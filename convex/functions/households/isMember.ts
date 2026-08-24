import type { Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";

type MemberCtx = Pick<QueryCtx, "db">;

/**
 * Answers "does this user belong to this household?" Membership is many-to-many via
 * `householdUsers`, so — unlike `isAuthorized` — there is no single owner field to walk.
 *
 * ⚠️ Never call this from a `router/` file. If a router needs a membership check, it uses
 *    `householdQuery`. Direct calls belong in `functions/`.
 */
export const isMember = async (
  ctx: MemberCtx,
  householdId: Id<"households">,
  userId: Id<"users">,
): Promise<boolean> => {
  const membership = await ctx.db
    .query("householdUsers")
    .withIndex("by_household_and_user", (q) =>
      q.eq("householdId", householdId).eq("userId", userId),
    )
    .first();

  return membership !== null;
};
