import type { Doc } from "@convex/_generated/dataModel";
import { REVIEW_ACCOUNT } from "@convex/functions/auth/reviewAccount";
import { posthog } from "@convex/lib/posthog/client";
import type { MutationCtx } from "@convex/procedures";
import type { AnalyticsEvent } from "@convex/schema/events";

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days since the account was created, from the `users` row's `_creationTime`. */
export const accountAgeDays = (createdAt: number, now: number): number => Math.floor((now - createdAt) / DAY_MS);

/**
 * The account an event is about, as the caller holds it: the purge clears `email` before it reports,
 * so the row is read by the caller beforehand, never by this helper. Only `_id` when the row is gone.
 */
export type AccountHolder = Pick<Doc<"users">, "_id"> & Partial<Pick<Doc<"users">, "_creationTime" | "email">>;

/**
 * Sends PostHog one event about an account, on the person its screens and costs are already filed
 * under: the `users` id, which the purge turns into an anonymous tombstone. Never a name, an email
 * or anything the cook wrote. `accountAgeDays` is added whenever the creation time is known.
 *
 * **Nothing for the store reviewer's shared account** (`REVIEW_ACCOUNT`). App Review tries the
 * deletion flow at each submission and the next reviewer's sign-in cancels it, so counted, every
 * submission would add a cook leaving and one coming back. The email is only compared, never sent.
 *
 * Called from the mutation that makes the change, so the event goes out only if that mutation
 * commits: `capture` schedules the send rather than making it. **Never throws**, as tracing does
 * (ADR 0019): a failure to schedule is logged, and the deletion or cancellation it reports goes on.
 */
export const captureAccountEvent = async (
  ctx: Pick<MutationCtx, "scheduler">,
  { user, event, properties }: { user: AccountHolder; event: AnalyticsEvent; properties: Record<string, string | number> },
): Promise<void> => {
  if (user.email === REVIEW_ACCOUNT.email) return;

  const age = user._creationTime === undefined ? {} : { accountAgeDays: accountAgeDays(user._creationTime, Date.now()) };
  try {
    await posthog.capture(ctx, { distinctId: user._id, event, properties: { ...age, ...properties } });
  } catch (error) {
    console.error(`[analytics] could not schedule "${event}" for ${user._id}`, error);
  }
};
