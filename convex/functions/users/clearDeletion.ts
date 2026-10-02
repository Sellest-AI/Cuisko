import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";

type ClearCtx = Pick<MutationCtx, "db">;

/**
 * Cancels a pending deletion, because the cook signed back in. The sheet that took the request says
 * so: "sign back in before then to keep your account".
 *
 * Called from `beforeSessionCreation` in `convex/auth.ts`, which runs when a sign-in creates a
 * session, never when a session refreshes its token. Keeping the app open is not coming back: only
 * signing in again is. The scheduled purge is left where it is and finds the date gone (`purgeUser`).
 *
 * Writes nothing when there is nothing to cancel, so an ordinary sign-in costs one read. A tombstone
 * never reaches here (its sign-ins are deleted with it), and has no date to clear if it did.
 */
export const clearDeletion = async (ctx: ClearCtx, userId: Id<"users">): Promise<void> => {
  const extended = await ctx.db
    .query("usersExtended")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();

  if (extended?.deletionDueAt === undefined) return;

  await ctx.db.patch(extended._id, { deletionDueAt: undefined, updatedAt: Date.now() });
};
