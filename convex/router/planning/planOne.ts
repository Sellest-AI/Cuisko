import { v } from "convex/values";

import { planMeal } from "@convex/functions/planning/planMeal";
import { vMealSlot } from "@convex/schema/households";
import { householdMutation } from "@convex/procedures";

/**
 * Puts one dish on one plate of the kept week — the recipe screen's "add to my list".
 *
 * `householdMutation`, so membership is the authorization and `ctx.householdId` is the only week
 * this call can write to. There is no `userId` argument: the caller's own recipes are `ctx.userId`'s,
 * which is what lets `commitPlan` refuse a plate naming somebody else's private recipe. A plate
 * already on that day and slot is replaced — see `planMeal`.
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
    planMeal(ctx, { ...args, householdId: ctx.householdId, userId: ctx.userId }),
});
