import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import type { AnalyticsEvent, EventProperties } from "@convex/schema/events";

import { posthog } from "./client";

/**
 * One event as `captureEvent` takes it: a union over every event, so its `properties` must be the
 * ones `EventProperties` declares for that name. A missing id is a compile error, not a gap in a chart.
 */
export type CapturedEvent<E extends AnalyticsEvent = AnalyticsEvent> = {
  [Name in E]: {
    event: Name;
    /** The cook, or the household's id with `personless: true` when no cook acted (`skipMeal`). */
    distinctId: string;
    householdId?: Id<"households">;
    personless?: boolean;
    properties: EventProperties[Name];
  };
}[E];

/**
 * Sends PostHog one product event, from the mutation that made the change it reports.
 *
 * `capture` schedules the send rather than making it, so the event goes out only if the calling
 * mutation commits. **Never throws**, as tracing does (ADR 0019): a failure to schedule is logged,
 * and the write it reports goes on.
 *
 * `householdId` files the event under the `household` group as well, so PostHog counts households
 * beside cooks. `personless` is for a change no cook made, the scheduler skipping a plate: the
 * household id stands in as `distinctId`, and `$process_person_profile: false` keeps it from
 * becoming a person.
 *
 * Never identifiable data that cannot be anonymized afterwards (an email, a person's name, text the
 * cook wrote). Ids and catalog names are fine — see ADR 0019.
 */
export const captureEvent = async (
  ctx: Pick<MutationCtx, "scheduler">,
  { event, distinctId, householdId, personless, properties }: CapturedEvent,
): Promise<void> => {
  try {
    await posthog.capture(ctx, {
      distinctId,
      event,
      properties: personless ? { ...properties, $process_person_profile: false } : properties,
      ...(householdId && { groups: { household: householdId } }),
    });
  } catch (error) {
    console.error(`[analytics] could not schedule "${event}" for ${distinctId}`, error);
  }
};
