/**
 * The recipe shapes that cross a function boundary but are never a row.
 *
 * Separate from `recipes.ts` because they answer a different question. `defineTable` there
 * describes what the database holds; these describe what a payload looks like in flight — what the
 * agent hands to `createOne`, what it hands to `translateOne`. `vSanitizedRecipe` says as much
 * itself below: it deliberately is not `recipes.validator`.
 *
 * They stay under `convex/schema/` rather than beside their routers because they are built from
 * this folder's vocabulary — `vEquipments`, `vUnit`, `vLocale`, `DIFFICULTY_LEVELS` — and a change
 * to the `recipes` table has to force a look at them.
 */

import { v } from "convex/values";
import { vLocale } from "./i18n";
import { vUnit } from "./ingredients";
import { vEquipments } from "./cellars";
import { DIFFICULTY_LEVELS } from "@shared/recipes";
import { CUISINES } from "@shared/cuisines";
import { AUTHORED_TAGS } from "@shared/tags";

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
