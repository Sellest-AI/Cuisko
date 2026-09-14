import { v } from "convex/values";

import { dropMeal } from "@convex/functions/planning/dropMeal";
import { householdMutation } from "@convex/procedures";

/**
 * Drops one plate from the kept week: its claims come off the grocery list, and the plan row goes
 * with its last plate.
 *
 * `householdMutation`, so membership is the authorization, and the handler refuses a plate that
 * belongs to another household — the same boundary every planning write keeps. `today` is the
 * client's local midnight: a jar this plate bought is handed to a plate still ahead of it.
 */
export const authed = householdMutation({
  args: { mealId: v.id("plannedMeals"), today: v.number() },
  handler: (ctx, args) => dropMeal(ctx, { ...args, householdId: ctx.householdId }),
});
