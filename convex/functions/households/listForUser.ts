import { ConvexError } from "convex/values";

import type { Doc, Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";
import { avatarSeed } from "@shared/avatars";

import type { AppUser } from "../users/loadUser";

type ListCtx = Pick<QueryCtx, "db">;

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
const _householdsOf = async (ctx: ListCtx, userId: Id<"users">): Promise<Doc<"households">[]> => {
  const memberships = await ctx.db
    .query("householdUsers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const households = await Promise.all(
    memberships.map((membership) => ctx.db.get(membership.householdId)),
  );

  return households.filter((household) => household !== null);
};

/** One household as the account drawer draws it. A projection, so the full row never ships. */
export type HouseholdCard = {
  _id: Id<"households">;
  name: string;
  inviteCode: string;
  /** One per current member, derived here and never on the client (ADR 0015). */
  memberSeeds: string[];
  /** Exactly one card carries it while the list is non-empty. */
  isCurrent: boolean;
};

/**
 * The caller's households, oldest membership first, with who is in each and which one the app is
 * shopping for.
 *
 * "Current" is `currentHouseholdId` when it still names one of these, and the oldest membership
 * otherwise: an account made before sign-up created households has no pointer, and a pointer the
 * cascade detached is unset. Falling back here rather than failing is what keeps both of them
 * shopping somewhere.
 */
export const listForUser = async (
  ctx: ListCtx,
  user: Pick<AppUser, "_id" | "currentHouseholdId">,
): Promise<HouseholdCard[]> => {
  const households = await _householdsOf(ctx, user._id);

  const currentId = households.some((household) => household._id === user.currentHouseholdId)
    ? user.currentHouseholdId
    : households[0]?._id;

  return Promise.all(
    households.map(async (household) => {
      // Only an emptied household loses its code, and the caller is in this one, so it is not empty.
      if (!household.inviteCode) throw new ConvexError({ code: "INVARIANT", message: "Member of a household with no code" });

      const members = await ctx.db
        .query("householdUsers")
        .withIndex("by_household", (q) => q.eq("householdId", household._id))
        .collect();

      return {
        _id: household._id,
        name: household.name,
        inviteCode: household.inviteCode,
        memberSeeds: members.map((member) => avatarSeed(member.userId)),
        isCurrent: household._id === currentId,
      };
    }),
  );
};
