import { v } from "convex/values";

import { dropMeal } from "@convex/functions/planning/dropMeal";
import { reportedPlate } from "@convex/functions/planning/reportedPlate";
import { captureEvent } from "@convex/lib/posthog/captureEvent";
import { householdMutation } from "@convex/procedures";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Drops one plate from the kept week: its claims come off the grocery list, and the plan row goes
 * with its last plate.
 *
 * `householdMutation`, so membership is the authorization, and the handler refuses a plate that
 * belongs to another household — the same boundary every planning write keeps. `today` is the
 * client's local midnight: a jar this plate bought is handed to a plate still ahead of it.
 *
 * Reports `meal removed` (ADR 0019) from here and not from `dropMeal`, which `commitPlan` also
 * calls to replace a plate: a new week taking a slot is not the cook rejecting the dish.
 */
export const authed = householdMutation({
  /** `isUndo`: the chat's undo of a plate Cuisko just planned. Only reported, never acted on. */
  args: { mealId: v.id("plannedMeals"), today: v.number(), isUndo: v.optional(v.boolean()) },
  handler: async (ctx, { isUndo, ...args }) => {
    const dropped = await dropMeal(ctx, { ...args, householdId: ctx.householdId });

    await captureEvent(ctx, {
      event: "meal removed",
      distinctId: ctx.userId,
      householdId: ctx.householdId,
      properties: {
        ...(await reportedPlate(ctx, dropped)),
        daysAhead: Math.round((dropped.date - args.today) / DAY_MS),
        servings: dropped.servings,
        isUndo: isUndo ?? false,
      },
    });
  },
});
