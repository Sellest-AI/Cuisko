import { v } from "convex/values";
import { defineTable } from "convex/server";
import { vUnit } from "./ingredients";

/** One list per household — a household splitting into several lists is a future migration. */
export const groceryListItems = defineTable({
  householdId: v.id("households"),
  ingredientId: v.id("ingredients"),
  unit: vUnit,
  quantity: v.number(),
  updatedAt: v.number(), // S5
})
  .index("by_household", ["householdId"])
  .index("by_ingredient", ["ingredientId"])
  .index("by_household_id_and_ingredient_id", ["householdId", "ingredientId"]);

/** One cellar per household — a household splitting into several cellars is a future migration. */
export const cellarItems = defineTable({
  householdId: v.id("households"),
  ingredientId: v.id("ingredients"),
  unit: vUnit,
  quantity: v.number(),
  expirationDate: v.optional(v.number()),
  updatedAt: v.number(), // S5
})
  .index("by_household", ["householdId"])
  .index("by_ingredient", ["ingredientId"])
  .index("by_household_id_and_ingredient_id", ["householdId", "ingredientId"]);

export const recentlyUsedIngredients = defineTable({
  householdId: v.id("households"),
  ingredientId: v.id("ingredients"),
  unit: vUnit,
  quantity: v.number(),
  updatedAt: v.number(), // S5
})
  .index("by_household", ["householdId"])
  .index("by_ingredient", ["ingredientId"])
  .index("by_household_id_and_ingredient_id", ["householdId", "ingredientId"]);
