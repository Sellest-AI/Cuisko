import { defineTable } from "convex/server";
import { vLocalized } from "./i18n";
import { v } from "convex/values";
import { vUnit } from "./ingredients";
import { vEquipments } from "./cellars";
import { DIFFICULTY_LEVELS } from "@shared/recipes";
import { CUISINES } from "@shared/cuisines";
import { TAGS } from "@shared/tags";

export const recipes = defineTable({
  title: vLocalized,
  description: vLocalized,
  instructions: vLocalized,
  servings: v.number(),
  equipments: vEquipments,
  difficulty: v.union(...DIFFICULTY_LEVELS.map(v.literal)),
  userId: v.optional(v.id("users")),
  /**
   * Closed vocabularies rather than free strings, and for one reason: the model that fills these
   * in speaks a single locale per run, so free text would store "italienne" from a French cook and
   * "Italian" from an English one — two recipes of the same cuisine that never group or filter
   * together, with no symptom until the app holds both locales. The stored value is locale-free;
   * the word on screen is a translation key. `tags` has that plus an unbounded range, which no
   * filter UI can be built against. See @shared/cuisines and @shared/tags.
   */
  tags: v.array(v.union(...TAGS.map(v.literal))),
  cuisine: v.union(...CUISINES.map(v.literal)),
  timings: v.object({
    preparation: v.optional(v.number()),
    cooking: v.optional(v.number()),
    resting: v.optional(v.number()),
  }),
  updatedAt: v.number(), // S5
})
  .index("by_user", ["userId"])
  .index("by_difficulty", ["difficulty"])
  .searchIndex("search_title_en", { searchField: "title.values.en" })
  .searchIndex("search_title_fr", { searchField: "title.values.fr" });

export const recipeIngredients = defineTable({
  recipeId: v.id("recipes"),
  ingredientId: v.id("ingredients"),
  position: v.number(),
  quantity: v.number(),
  unit: vUnit,
  updatedAt: v.number(), // S5
})
  .index("by_recipe", ["recipeId"])
  .index("by_ingredient", ["ingredientId"]);


export const recipeFavorites = defineTable({
  recipeId: v.id("recipes"),
  userId: v.id("users"),
})
  .index("by_user", ["userId"])
  .index("by_recipe", ["recipeId"]);
