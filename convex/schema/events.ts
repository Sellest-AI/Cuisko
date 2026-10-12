/**
 * Every product event the backend sends PostHog, named as PostHog shows them. Cost is not here: a
 * paid call is an `$ai_generation`, sent by the trace layer (`schema/tracing.ts`).
 *
 * A closed list for the reason `OPERATIONS` is one (`schema/tracing.ts`): a funnel joins these by
 * name, and `account deleted` next to `account_deleted` would split it without anything failing.
 */
export const EVENTS = [
  // An account's life.
  /** A new deletion request, not a repeat while one is pending (`requestDeletion`). */
  "account deletion requested",
  /** A sign-in that cleared a pending request (`clearDeletion`). */
  "account deletion cancelled",
  /** The purge ran, anonymizing or, forced, erasing the account (`purgeUser`). */
  "account deleted",
] as const;

export type AnalyticsEvent = (typeof EVENTS)[number];
