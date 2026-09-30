import { v } from "convex/values";

import { commitPlan } from "@convex/functions/planning/commitPlan";
import { vMealSlot } from "@convex/schema/households";
import { vRecipeUnit } from "@convex/schema/ingredients";
import { householdMutation } from "@convex/procedures";

/**
 * Keeps the week the user just agreed to, and puts what it is missing on the grocery list.
 *
 * `householdMutation`, so membership is the authorization: the plan, its plates and the list it
 * feeds all belong to the household, and `ctx.householdId` is the only one this call can write to.
 * A plate may name any recipe that exists, whoever wrote it (ADR 0014): the catalog is shared,
 * and planning a recipe changes nothing of it.
 *
 * Only the *choices* come up: which dish on which day, for how many, and what the shopper says is
 * already in the kitchen. Every quantity is recomputed server-side against the cellar as it stands —
 * see `commitPlan`.
 */
export const authed = householdMutation({
  args: {
    plates: v.array(
      v.object({
        recipeId: v.id("recipes"),
        date: v.number(),
        slot: vMealSlot,
        servings: v.number(),
      }),
    ),
    people: v.number(),
    seed: v.number(),
    note: v.optional(v.string()),
    today: v.number(),
    owned: v.array(v.object({ ingredientId: v.id("ingredients"), unit: vRecipeUnit })),
  },
  handler: async (ctx, args) =>
    (await commitPlan(ctx, { ...args, householdId: ctx.householdId })).mealPlanId,
});
