import type { Doc, Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";

type HouseholdCtx = Pick<QueryCtx, "db">;

/**
 * Every household a user belongs to, oldest membership first.
 *
 * Membership is many-to-many via `householdUsers` — as in `isMember`, there is no owner field on
 * the household itself — so this is the join rows from `by_user`, then the rows they point at.
 *
 * The order is the index's own: `by_user` scans by `userId` then `_creationTime`, so the first
 * household is the one the user joined first. That matters more than it looks — `listForUser`
 * falls back to `[0]` when no household is selected, and an order that shifted between reads would
 * move a shopper's whole cellar out from under them.
 *
 * A membership whose household no longer exists is skipped rather than returned as a hole: the
 * join row can outlive its household, and one dangling row must not blank the list.
 */
export const getForUser = async (
  ctx: HouseholdCtx,
  userId: Id<"users">,
): Promise<Doc<"households">[]> => {
  const memberships = await ctx.db
    .query("householdUsers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const households = await Promise.all(
    memberships.map((membership) => ctx.db.get(membership.householdId)),
  );

  return households.filter((household) => household !== null);
};
