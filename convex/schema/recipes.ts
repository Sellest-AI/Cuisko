import { defineTable } from "convex/server";
import { vLocale, vLocalized } from "./i18n";
import { v } from "convex/values";
import { vUnit } from "./ingredients";
import { vEquipments } from "./cellars";
import { DIFFICULTY_LEVELS } from "@shared/recipes";
import { CUISINES } from "@shared/cuisines";
import { AUTHORED_TAGS, TAGS } from "@shared/tags";

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

/**
 * Instruction groups as the agent hands them over, before `serializeInstructions` flattens them
 * into the single string a `vLocalized` column can hold. The flat form is what the database
 * stores; this is what crosses a function boundary on the way there and back.
 */
export const vInstructionGroups = v.array(
  v.object({ title: v.optional(v.string()), steps: v.array(v.string()) }),
);

/**
 * A recipe as `sanitizeRecipe` returns it: ONE language, every localized field a bare string, and
 * every ingredient a name rather than a catalog id.
 *
 * It deliberately is not `recipes.validator`. The two differences are the whole of the slice —
 * translation is a second agent that runs after the insert, and turning a name into a catalog row
 * is `functions/ingredients/matchIngredients.ts`. Keeping the payload in this shape is what lets
 * `saveRecipe` be the one place that knows how a generation becomes a document.
 *
 * `tags` is `AUTHORED_TAGS`, not `TAGS`: the computed half falls out of the ingredients, so a model
 * cannot be the one to send it.
 */
export const vSanitizedRecipe = v.object({
  title: v.string(),
  description: v.string(),
  servings: v.number(),
  difficulty: v.union(...DIFFICULTY_LEVELS.map(v.literal)),
  cuisine: v.union(...CUISINES.map(v.literal)),
  tags: v.array(v.union(...AUTHORED_TAGS.map(v.literal))),
  equipments: vEquipments,
  timings: v.object({
    preparation: v.optional(v.number()),
    cooking: v.optional(v.number()),
    resting: v.optional(v.number()),
  }),
  instructions: vInstructionGroups,
  ingredients: v.array(v.object({ name: v.string(), quantity: v.number(), unit: vUnit })),
});

/**
 * One recipe rendered into ONE language, carrying the locale it was rendered into.
 *
 * The locale travels with the recipe rather than beside it in a parallel array, for the reason
 * `TranslatedRecipe` gives: the model returns languages in whatever order it worked through them,
 * and a caller matching by index files a German recipe under `fr`.
 */
export const vTranslatedRecipe = v.object({
  locale: vLocale,
  recipe: v.object({
    title: v.string(),
    description: v.string(),
    instructions: vInstructionGroups,
  }),
});
