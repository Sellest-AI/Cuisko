import { v } from "convex/values";

import { planMeal } from "@convex/functions/planning/planMeal";
import { vMealSlot } from "@convex/schema/households";
import { householdMutation, internalMutation } from "@convex/procedures";

const args = {
  recipeId: v.id("recipes"),
  date: v.number(),
  slot: vMealSlot,
  servings: v.number(),
  today: v.number(),
};

/**
 * Puts one dish on one plate of the kept week — the recipe screen's "add to my list".
 *
 * `householdMutation`, so membership is the authorization and `ctx.householdId` is the only week
 * this call can write to. The recipe may be anyone's (ADR 0014): the catalog is shared, and a plate
 * holds an id, not a copy. A plate already on that day and slot is replaced — see `planMeal`.
 *
 * Returns the plan id only, as it always has: the screen needs nothing more.
 */
export const authed = householdMutation({
  args,
  handler: async (ctx, a) =>
    (await planMeal(ctx, { ...a, householdId: ctx.householdId })).mealPlanId,
});

/**
 * The same plate, for Cuisko: its turn is a scheduled action with no signed-in cook, so the
 * household arrives as the one `sendMessage` checked. Returns the plate and what it replaced, which
 * the chat's undo needs.
 */
export const _internal = internalMutation({
  args: { ...args, householdId: v.id("households") },
  handler: planMeal,
});
