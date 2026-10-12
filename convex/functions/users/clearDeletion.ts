import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";

import { captureAccountEvent, DAY_MS } from "./captureAccountEvent";

type ClearCtx = Pick<MutationCtx, "db" | "scheduler">;

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
 *
 * A cancellation is reported to analytics (`account deletion cancelled`), with the days that were
 * left: a cook who comes back the next day and one who comes back on the last are different stories.
 */
export const clearDeletion = async (ctx: ClearCtx, userId: Id<"users">): Promise<void> => {
  const extended = await ctx.db
    .query("usersExtended")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();

  if (extended?.deletionDueAt === undefined) return;

  const now = Date.now();
  await ctx.db.patch(extended._id, { deletionDueAt: undefined, updatedAt: now });

  await captureAccountEvent(ctx, {
    user: (await ctx.db.get(userId)) ?? { _id: userId },
    event: "account deletion cancelled",
    properties: { daysLeft: Math.max(0, Math.ceil((extended.deletionDueAt - now) / DAY_MS)) },
  });
};
