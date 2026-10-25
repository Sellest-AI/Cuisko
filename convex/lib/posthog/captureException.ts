import type { MutationCtx } from "@convex/procedures";

import { posthog } from "./client";

/** What an exception carries beside its stack: flat values, as on an event, so an issue's list can be filtered by them. */
export type ExceptionProperties = Record<string, string | number | boolean | undefined>;

/**
 * Sends PostHog Error tracking one failure, with the error itself, so the issue carries its stack.
 *
 * Error tracking opens one issue per error type and message, so a message is fixed per cause and
 * what varies (an address, a status) goes in `properties` or the error's `cause`. A plain-object
 * `cause`'s flat values are sent as properties too; anything else in it (an object, a list) is left
 * out, as it would be refused on an event. Scheduled, so the caller never waits on PostHog; only a
 * mutation's send waits on its commit, and from an action it goes out at once, whatever follows.
 * Like `captureEvent` it **never throws**: a failure to schedule is logged, and the caller goes on
 * to fail as it would have.
 *
 * Never the cook's own words in `properties` (ADR 0019): a dish they typed, a note.
 */
export const captureException = async (
  ctx: Pick<MutationCtx, "scheduler">,
  { error, distinctId, properties }: { error: unknown; distinctId: string; properties: ExceptionProperties },
): Promise<void> => {
  const cause = error instanceof Error && "cause" in error && _isPlainObject(error.cause) ? _flatOf(error.cause) : {};
  try {
    await posthog.captureException(ctx, { error, distinctId, additionalProperties: { ...cause, ...properties } });
  } catch (caught) {
    console.error(`[error tracking] could not schedule an exception for ${distinctId}`, caught);
  }
};

const _isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;

const _isFlat = (value: unknown): value is string | number | boolean =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean";

const _flatOf = (cause: Record<string, unknown>): ExceptionProperties =>
  Object.fromEntries(
    Object.entries(cause).filter((entry): entry is [string, string | number | boolean] => _isFlat(entry[1])),
  );
