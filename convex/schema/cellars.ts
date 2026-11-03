import { v } from "convex/values";
import { defineTable } from "convex/server";
import { vUnit } from "./ingredients";
import { EQUIPMENTS } from "@shared/equipments";

export const vEquipments = v.array(v.union(...EQUIPMENTS.map(v.literal)));

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

/**
 * What is on the list and is not food: shampoo, batteries. A table of its own because a grocery line
 * requires an ingredient, and the plan's claims and the merge ladder read one. Never goes to the
 * cellar. `nameKey` is `name` folded, so "Shampoo" and "shampoo" are one row.
 */
export const groceryProducts = defineTable({
  householdId: v.id("households"),
  name: v.string(),
  nameKey: v.string(),
  emoji: v.string(),
  unit: vUnit,
  quantity: v.number(),
  updatedAt: v.number(), // S5
}).index("by_household_and_name_key", ["householdId", "nameKey"]);

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
