import { defineTable } from "convex/server";
import { v } from "convex/values";

import { vMealSlot, vMealSlots } from "./households";
import { vUnit } from "./ingredients";

export const vPlannedMealStatus = v.union(
  v.literal("planned"),
  v.literal("cooked"),
);

/** One run of the planning tunnel for one household. */
export const mealPlans = defineTable({
  householdId: v.id("households"),
  startDate: v.number(),
  days: v.number(),
  slots: vMealSlots,
  people: v.number(),
  seed: v.number(),
  note: v.optional(v.string()),
  updatedAt: v.number(), // S5
})
  .index("by_household", ["householdId"])
  .index("by_household_id_and_start_date", ["householdId", "startDate"]);

/** One plate in a household's planned week. */
export const plannedMeals = defineTable({
  mealPlanId: v.id("mealPlans"),
  householdId: v.id("households"),
  recipeId: v.id("recipes"),
  date: v.number(),
  slot: vMealSlot,
  servings: v.number(),
  status: vPlannedMealStatus,
  updatedAt: v.number(), // S5
})
  .index("by_meal_plan", ["mealPlanId"])
  .index("by_household_and_date", ["householdId", "date"])
  .index("by_recipe", ["recipeId"]);

/**
 * The ingredient ledger for one planned meal.
 *
 * `sourceQuantity` / `sourceUnit` preserve the recipe's words, `quantity` / `unit`
 * describe the stock reservation, and `groceryQuantity` records the lossy shopping
 * write that cannot be safely recomputed later.
 */
export const plannedMealIngredients = defineTable({
  plannedMealId: v.id("plannedMeals"),
  ingredientId: v.id("ingredients"),
  sourceQuantity: v.number(),
  sourceUnit: vUnit,
  quantity: v.number(),
  unit: vUnit,
  /**
   * What went onto the grocery list for this line, **in the unit that list row holds** — the
   * ingredient's `defaultUnit`, not this row's `unit`. The household shops in "3 onions" and
   * reserves in grams, and the two are different numbers: this one is the rounded, merged figure
   * that actually landed, which is what backing the meal out has to give back. The unit is not
   * stored beside it because `groceryListItemId` names the row that holds it.
   */
  groceryQuantity: v.optional(v.number()),
  groceryListItemId: v.optional(v.id("groceryListItems")),
  cellarItemId: v.optional(v.id("cellarItems")),
  updatedAt: v.number(), // S5
})
  .index("by_planned_meal", ["plannedMealId"])
  .index("by_ingredient", ["ingredientId"])
  .index("by_grocery_list_item", ["groceryListItemId"])
  .index("by_cellar_item", ["cellarItemId"]);
