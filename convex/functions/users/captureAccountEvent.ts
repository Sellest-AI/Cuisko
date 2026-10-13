import type { Doc } from "@convex/_generated/dataModel";
import { REVIEW_ACCOUNT } from "@convex/functions/auth/reviewAccount";
import { type CapturedEvent, captureEvent } from "@convex/lib/posthog/captureEvent";
import type { MutationCtx } from "@convex/procedures";
import type { EventProperties } from "@convex/schema/events";

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days since the account was created, from the `users` row's `_creationTime`. */
export const accountAgeDays = (createdAt: number, now: number): number => Math.floor((now - createdAt) / DAY_MS);

/**
 * The account an event is about, as the caller holds it: the purge clears `email` before it reports,
 * so the row is read by the caller beforehand, never by this helper. Only `_id` when the row is gone.
 */
export type AccountHolder = Pick<Doc<"users">, "_id"> & Partial<Pick<Doc<"users">, "_creationTime" | "email">>;

type AccountEvent = "account deletion requested" | "account deletion cancelled" | "account deleted";

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
 * commits, and never throws: both are `captureEvent`'s.
 */
export const captureAccountEvent = async <E extends AccountEvent>(
  ctx: Pick<MutationCtx, "scheduler">,
  { user, event, properties }: { user: AccountHolder; event: E; properties: EventProperties[E] },
): Promise<void> => {
  if (user.email === REVIEW_ACCOUNT.email) return;

  // The cast only re-pairs `event` with its own properties, which TypeScript cannot follow through
  // a generic `E`; the signature above is what checks each caller's properties against `EventProperties`.
  await captureEvent(ctx, {
    distinctId: user._id,
    event,
    properties: user._creationTime === undefined
      ? properties
      : { accountAgeDays: accountAgeDays(user._creationTime, Date.now()), ...properties },
  } as CapturedEvent<AccountEvent>);
};
