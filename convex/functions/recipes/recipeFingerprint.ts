import { hashText } from "@convex/lib/i18n";

import type { RecipeDetail } from "./loadRecipe";
import { toModelRecipe } from "./toModelRecipe";

/**
 * Every object's keys in one order, so two equal recipes serialize alike. Needed because the two
 * sides do not build theirs the same way: the action's recipe crossed `runQuery`, which hands
 * objects back with their keys sorted, while the mutation's comes straight from `loadRecipe`.
 */
const _sortedKeys = (_key: string, value: unknown): unknown =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : value;

/**
 * A hash of the recipe as the verifier reads it: `toModelRecipe` of one locale's detail — its title,
 * description, steps, facts and ingredient lines — and nothing else.
 *
 * So it moves when that text moves, and not when a write leaves it alone: a translation into
 * another locale, the photos, tags re-derived by a refresh. `assertUnchangedSince` compares two.
 *
 * The owner is left out: `getOne._internal` carries it and `loadRecipe` does not, and it is not
 * something a verify judges.
 */
export const recipeFingerprint = (recipe: RecipeDetail): string =>
  hashText(JSON.stringify(toModelRecipe({ ...recipe, userId: undefined }), _sortedKeys));
