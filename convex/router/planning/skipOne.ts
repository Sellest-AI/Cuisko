import { v } from "convex/values";

import { reportedPlate } from "@convex/functions/planning/reportedPlate";
import { skipMeal } from "@convex/functions/planning/skipMeal";
import { captureEvent } from "@convex/lib/posthog/captureEvent";
import { internalMutation } from "@convex/procedures";

/**
 * The scheduler's tap, a day after a plate's day: a plate nobody cooked is closed — see `skipMeal`.
 *
 * Internal only. No client asks for a plate to be skipped; `commitPlan` books this at `skipAt` for
 * every plate it writes, and `migrations.scheduleSkips` books it for the plates written before
 * that. It takes the plate id and nothing else, and does nothing unless the plate is still `planned`.
 *
 * Reports `meal skipped` (ADR 0019) under the household alone: the clock did this, no cook did, and
 * `personless` keeps the household's id from becoming a person in PostHog.
 */
export const _internal = internalMutation({
  args: { mealId: v.id("plannedMeals") },
  handler: async (ctx, args): Promise<void> => {
    const skipped = await skipMeal(ctx, args);
    if (!skipped) return;

    await captureEvent(ctx, {
      event: "meal skipped",
      distinctId: skipped.householdId,
      householdId: skipped.householdId,
      personless: true,
      properties: { ...(await reportedPlate(ctx, skipped)), servings: skipped.servings },
    });
  },
});
