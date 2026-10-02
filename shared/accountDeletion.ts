/**
 * How long an account waits between the cook asking for its deletion and the purge.
 *
 * In `shared/` because both halves name it: the server schedules the purge this far out
 * (`requestDeletion`), and the sheet tells the cook the date before they confirm, since confirming
 * signs them out and there is no screen after it to say so. One number, two importers.
 */
export const ACCOUNT_DELETION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
