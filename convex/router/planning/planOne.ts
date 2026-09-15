import { v } from "convex/values";

import { planMeal } from "@convex/functions/planning/planMeal";
import { vMealSlot } from "@convex/schema/households";
import { householdMutation } from "@convex/procedures";

/**
 * Puts one dish on one plate of the kept week — the recipe screen's "add to my list".
 *
 * `householdMutation`, so membership is the authorization and `ctx.householdId` is the only week
 * this call can write to. The recipe may be anyone's (ADR 0014): the catalog is shared, and a plate
 * holds an id, not a copy. A plate already on that day and slot is replaced — see `planMeal`.
 */
export const authed = householdMutation({
  args: {
    recipeId: v.id("recipes"),
    date: v.number(),
    slot: vMealSlot,
    servings: v.number(),
    today: v.number(),
  },
  handler: (ctx, args) =>
    planMeal(ctx, { ...args, householdId: ctx.householdId }),
});
