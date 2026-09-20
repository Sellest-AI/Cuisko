import { v } from "convex/values";

import { skipMeal } from "@convex/functions/planning/skipMeal";
import { internalMutation } from "@convex/procedures";

/**
 * The scheduler's tap, a day after a plate's day: a plate nobody cooked is closed — see `skipMeal`.
 *
 * Internal only. No client asks for a plate to be skipped; `commitPlan` books this at `skipAt` for
 * every plate it writes, and `migrations.scheduleSkips` books it for the plates written before
 * that. It takes the plate id and nothing else, and does nothing unless the plate is still `planned`.
 */
export const _internal = internalMutation({
  args: { mealId: v.id("plannedMeals") },
  handler: (ctx, args) => skipMeal(ctx, args),
});
