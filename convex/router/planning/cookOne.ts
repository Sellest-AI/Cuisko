import { v } from "convex/values";

import { cookMeal } from "@convex/functions/planning/cookMeal";
import { householdMutation } from "@convex/procedures";

/**
 * The step-by-step flow's last tap: the dish is cooked, so the cellar is spent and the plate settled.
 *
 * No plate id, by design — the server finds the plate from the recipe and the clock (see `cookMeal`).
 * `today` and `hour` are the client's local day and wall-clock hour: the server has no timezone, and
 * "lunch" only means something where the cook is standing. `householdMutation`, so membership is the
 * authorization and `ctx.householdId` is the only cellar this can spend; the recipe may be anyone's
 * (ADR 0014).
 */
export const authed = householdMutation({
  args: {
    recipeId: v.id("recipes"),
    servings: v.number(),
    today: v.number(),
    hour: v.number(),
  },
  handler: (ctx, args) => cookMeal(ctx, { ...args, householdId: ctx.householdId }),
});
