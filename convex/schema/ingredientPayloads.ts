/**
 * The ingredient shapes that cross a function boundary but are never a row.
 *
 * Separate from `ingredients.ts` for the reason `recipePayloads.ts` is separate from `recipes.ts`:
 * `defineTable` describes what the database holds, and this describes what a payload looks like in
 * flight — here, the facts an action gathered on its way to a write it cannot perform itself.
 *
 * It stays under `convex/schema/` because it is built from this folder's vocabulary, so a change to
 * the `ingredients` table forces a look at it.
 */

import { v } from "convex/values";

import { everyLocale, vLocale, vLocalizedList, vTranslationStatus } from "./i18n";
import {
  vAllergen,
  vCategory,
  vDiet,
  vIngredientNutrition,
  vUnit,
} from "./ingredients";

/**
 * The nutrients as a WRITER must supply them — the Nutri-Score inputs required, unlike the column.
 *
 * Built from the column's validator with the four Nutri-Score inputs it leaves optional re-stated as
 * required, so the field list is written once and the difference is the only thing this statement
 * says. That difference is what `computeNutriScore` needs: it reads its seven facts together, so a
 * row created with a missing one gets a grade computed from a gap. A source that measured six is
 * not a problem here — the agent fills the seventh and `measuredOver` puts the six measurements
 * back on top before any of this is reached.
 *
 * ⚠️ **`iron` is the one field this does NOT promote.** It is optional on the column because the
 * source may not know it, and no amount of asking a writer makes CIQUAL's 27 unmeasured foods
 * measured. The Nutri-Score does not read it, so nothing here degrades when it is absent — the
 * `iron-rich` tag is simply withheld (`nutritionTagsOf`).
 */
const vNutritionFacts = v.object({
  ...vIngredientNutrition.fields,
  saturatedFat: v.number(),
  sugars: v.number(),
  fiber: v.number(),
  sodium: v.number(),
});

/**
 * `IngredientFacts` as a validator — everything about an ingredient that somebody has to KNOW,
 * and nothing that is derived from it.
 *
 * **It deliberately is not `ingredients.validator`.** The derived fields are missing on purpose:
 * `search`, `nutriScore` and the `vLocalized` shape of `name` all come from `ingredientRow` and
 * from nowhere else (ADR 0011), so a payload that could carry them would be a payload that could
 * get them wrong. What crosses this boundary is facts; the row is built on the other side.
 *
 * The TypeScript half is `IngredientFacts` in `functions/ingredients/ingredientRow.ts`, and the two
 * must agree — the internal mutation validating against this one assigns straight into that one, so
 * a field added to either without the other fails to compile at the call site.
 *
 * `names` is total (`everyLocale`) rather than one-per-language-as-it-arrives, because a row stored
 * in one language is a row the other language's shopper creates a duplicate of. The writer closes
 * that gap before it gets here; this is where the promise is checked.
 */
export const vIngredientFacts = v.object({
  slug: v.optional(v.string()),
  names: everyLocale(v.object({ value: v.string(), status: vTranslationStatus })),
  /** The language the names were rendered from; `ingredientRow` falls back to `en` without it. */
  sourceLocale: v.optional(vLocale),
  emoji: v.string(),
  aliases: vLocalizedList,
  category: vCategory,
  diet: vDiet,
  /** `[]` is the claim "we considered the fourteen and this carries none", never an unfilled gap. */
  allergens: v.array(vAllergen),
  defaultUnit: vUnit,
  defaultQuantity: v.number(),
  gramsPerPiece: v.optional(v.number()),
  gramsPerMl: v.optional(v.number()),
  nutrition: vNutritionFacts,
});
