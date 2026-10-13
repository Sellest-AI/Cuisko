import { v } from "convex/values";

import { cookMeal } from "@convex/functions/planning/cookMeal";
import { reportedPlateOf } from "@convex/functions/planning/reportedPlate";
import { captureEvent } from "@convex/lib/posthog/captureEvent";
import { householdMutation } from "@convex/procedures";

/**
 * The step-by-step flow's last tap: the dish is cooked, so the cellar is spent and the plate settled.
 *
 * No plate id, by design — the server finds the plate from the recipe and the clock (see `cookMeal`).
 * `today` and `hour` are the client's local day and wall-clock hour: the server has no timezone, and
 * "lunch" only means something where the cook is standing. `householdMutation`, so membership is the
 * authorization and `ctx.householdId` is the only cellar this can spend; the recipe may be anyone's
 * (ADR 0014).
 *
 * Reports `meal cooked` (ADR 0019) with the plate, its week and its recipe; `fromPlate: false` is a
 * dish no plate had promised, on a plan of its own.
 */
export const authed = householdMutation({
  args: {
    recipeId: v.id("recipes"),
    servings: v.number(),
    today: v.number(),
    hour: v.number(),
  },
  handler: async (ctx, args) => {
    const { mealId, mealPlanId, fromPlate, recipe } = await cookMeal(ctx, { ...args, householdId: ctx.householdId });

    await captureEvent(ctx, {
      event: "meal cooked",
      distinctId: ctx.userId,
      householdId: ctx.householdId,
      properties: {
        ...reportedPlateOf({ _id: mealId, mealPlanId, recipeId: args.recipeId }, recipe),
        fromPlate,
        servings: args.servings,
      },
    });

    return mealId;
  },
});
