import { internal } from "@convex/_generated/api";
import type { MutationCtx } from "@convex/procedures";
import { ACCOUNT_DELETION_GRACE_MS } from "@shared/accountDeletion";

import { captureAccountEvent } from "./captureAccountEvent";
import type { AppUser } from "./loadUser";

type RequestCtx = Pick<MutationCtx, "db" | "scheduler">;

/**
 * Asks for the caller's account to be deleted, and says when.
 *
 * Idempotent while pending: asking again returns the same moment rather than pushing it back, so a
 * retry after a lost response cannot extend the wait. Signing in clears the request (`clearDeletion`),
 * which is why asking, cancelling and asking again always starts a fresh 30 days.
 *
 * Every account may ask, the store reviewer's shared one included: App Review tries this flow. It
 * costs that account nothing, since the next reviewer's sign-in cancels a pending deletion, and one
 * that did run is recreated by the next long press (see `auth/reviewAccount.ts`).
 *
 * The purge is scheduled for the due date and never cancelled: `purgeUser` re-reads the date when it
 * wakes, so a cleared or later date turns that job into a no-op. A pending request already has its
 * job, which is why the early return schedules nothing.
 *
 * A new request is reported to analytics (`account deletion requested`); a repeat is not, so a
 * retry never counts as a second cook leaving.
 */
export const requestDeletion = async (
  ctx: RequestCtx,
  user: Pick<AppUser, "_id" | "_creationTime" | "_idExtended" | "deletionDueAt" | "email">,
): Promise<number> => {
  const now = Date.now();

  // Pending only while the date is ahead. A date already past usually belongs to a purge that failed,
  // and no job waits for it any more: asking again starts over, with a new date and a new job.
  // @limitation Design choice: it can also be a job the scheduler has not run yet, for the moments
  // after the due time; asking again in that window postpones the deletion by 30 days, which is what
  // asking again on that day promises.
  if (user.deletionDueAt !== undefined && user.deletionDueAt > now) return user.deletionDueAt;

  const deletionDueAt = now + ACCOUNT_DELETION_GRACE_MS;

  await ctx.db.patch(user._idExtended, { deletionDueAt, updatedAt: now });
  await ctx.scheduler.runAt(deletionDueAt, internal.router.users.purge._internal, { userId: user._id });

  await captureAccountEvent(ctx, { user, event: "account deletion requested", properties: { deletionDueAt } });

  return deletionDueAt;
};
