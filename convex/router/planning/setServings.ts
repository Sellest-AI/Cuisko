import { v } from "convex/values";

import { rescaleMeal } from "@convex/functions/planning/rescaleMeal";
import { householdMutation } from "@convex/procedures";

/**
 * Re-portions one plate of the kept week, and moves the grocery list with it.
 *
 * `householdMutation`, so membership is the authorization: the plate belongs to the household, and
 * the handler refuses one that does not — a plate of somebody else's week is not re-portionable by
 * naming it. `today` is the client's local midnight, the same "today" the commit was given and the
 * line past which a meal still holds stock.
 */
export const authed = householdMutation({
  args: {
    mealId: v.id("plannedMeals"),
    servings: v.number(),
    today: v.number(),
  },
  handler: (ctx, args) => rescaleMeal(ctx, { ...args, householdId: ctx.householdId }),
});
