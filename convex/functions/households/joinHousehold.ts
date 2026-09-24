import { ConvexError } from "convex/values";

import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";

import type { AppUser } from "../users/loadUser";
import { normalizeInviteCode } from "./inviteCode";
import { selectHousehold } from "./selectHousehold";

type JoinCtx = Pick<MutationCtx, "db">;

/**
 * Joins the household holding `code`, and makes it the one the app shops for.
 *
 * The code is the credential: whoever holds it may come in, which is why the router is an
 * `authMutation` and not a `householdMutation` — the caller is by definition not a member yet.
 * An emptied household has no code, so an old one lands here as `NOT_FOUND` like any typo.
 *
 * Joining a household you already belong to is not an error: the tap still means "take me there".
 * Rejoining one you left clears your `householdFormerMembers` row: you are not a former member now.
 */
export const joinHousehold = async (
  ctx: JoinCtx,
  user: Pick<AppUser, "_id" | "_idExtended">,
  code: string,
): Promise<Id<"households">> => {
  const inviteCode = normalizeInviteCode(code);

  const household = inviteCode
    ? await ctx.db
      .query("households")
      .withIndex("by_invite_code", (q) => q.eq("inviteCode", inviteCode))
      .first()
    : null;

  if (!household) throw new ConvexError({ code: "NOT_FOUND" });

  const membership = await ctx.db
    .query("householdUsers")
    .withIndex("by_household_and_user", (q) =>
      q.eq("householdId", household._id).eq("userId", user._id),
    )
    .first();

  if (!membership) await ctx.db.insert("householdUsers", { householdId: household._id, userId: user._id });

  // Back in, so no longer a former member. Leaving again writes a fresh row, which keeps one row
  // per person and its `_creationTime` their latest departure.
  const former = await ctx.db
    .query("householdFormerMembers")
    .withIndex("by_household_and_user", (q) =>
      q.eq("householdId", household._id).eq("userId", user._id),
    )
    .first();

  if (former) await ctx.db.delete(former._id);

  await selectHousehold(ctx, user, household._id);

  return household._id;
};
