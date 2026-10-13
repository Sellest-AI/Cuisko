import type { Doc } from "@convex/_generated/dataModel";
import { REVIEW_ACCOUNT } from "@convex/functions/auth/reviewAccount";
import type { CapturedEvent, EventProperties } from "@convex/schema/events";

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days since the account was created, from the `users` row's `_creationTime`. */
export const accountAgeDays = (createdAt: number, now: number): number => Math.floor((now - createdAt) / DAY_MS);

/**
 * The account an event is about, as the writer read it: the purge clears `email`, so it hands back
 * the row as it was before. Only `_id` when the row is gone.
 */
export type AccountHolder = Pick<Doc<"users">, "_id"> & Partial<Pick<Doc<"users">, "_creationTime" | "email">>;

export type AccountEvent = "account deletion requested" | "account deletion cancelled" | "account deleted";

/**
 * One event about an account, built for the entry point that sends it (ADR 0019): filed on the
 * `users` id, which the purge turns into an anonymous tombstone, never a name or an email.
 * `accountAgeDays` is added whenever the creation time is known.
 *
 * **`null` for the store reviewer's shared account** (`REVIEW_ACCOUNT`), so nothing is sent: App
 * Review tries the deletion flow at each submission and the next reviewer's sign-in cancels it, so
 * counted, every submission would add a cook leaving and one coming back. The email is only
 * compared, never sent.
 *
 * Builds, never sends: a `functions/` file does not import `captureEvent` (C18).
 */
export const accountEventOf = <E extends AccountEvent>(
  user: AccountHolder,
  event: E,
  properties: EventProperties[E],
): CapturedEvent<AccountEvent> | null => {
  if (user.email === REVIEW_ACCOUNT.email) return null;

  // The cast only re-pairs `event` with its own properties, which TypeScript cannot follow through
  // a generic `E`; the signature above is what checks each caller's properties against `EventProperties`.
  return {
    distinctId: user._id,
    event,
    properties: user._creationTime === undefined
      ? properties
      : { accountAgeDays: accountAgeDays(user._creationTime, Date.now()), ...properties },
  } as CapturedEvent<AccountEvent>;
};
