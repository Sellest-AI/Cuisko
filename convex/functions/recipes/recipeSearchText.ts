import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import { LOCALES } from "@convex/schema/i18n";
import type { LocalizedText } from "@convex/schema/i18n";
import { searchTextOf } from "@shared/search";

type Args = {
  /** The catalog rows the recipe's lines resolved to, in any order — duplicates are harmless. */
  ingredientIds: Id<"ingredients">[];
  /**
   * What the model wrote for EVERY line, matched or not.
   *
   * The unmatched ones are the reason this argument exists. `saveRecipe` drops a line it could not
   * resolve from `recipeIngredients`, so a recipe whose "nuoc-mâm" never matched the catalog would
   * be unfindable by the one ingredient that makes it what it is — while that word sits in the
   * instructions the cook is reading. The raw name is the only record of it.
   */
  names: string[];
};

/**
 * A recipe's ingredient search blob, one string per locale.
 *
 * Built from each matched ingredient's OWN blob rather than from its name, which is what makes a
 * recipe findable by an alias: `ingredients.search.fr` already holds "pomme de terre patates" plus
 * the accent-folded copy of each, so a search for "patates" reaches every recipe containing one
 * without this file knowing that aliases exist.
 *
 * Both locales are always written, and neither depends on the recipe's own language: ingredient
 * names are in the catalog in every locale from the moment it is seeded. That is why a translation
 * landing later does not invalidate this field, and why `saveTranslations` is not one of its
 * writers.
 */
export const recipeSearchText = async (
  ctx: Pick<MutationCtx, "db">,
  { ingredientIds, names }: Args,
): Promise<LocalizedText> => {
  const ingredients = await Promise.all(ingredientIds.map((id) => ctx.db.get(id)));

  const search: LocalizedText = {};

  for (const locale of LOCALES) {
    // Each ingredient's blob goes in whole. `searchTextOf` tokenizes everything it is handed, so a
    // blob spliced into another is de-duplicated against it token by token rather than nested
    // inside it — which is what keeps a shared word like "huile" stored once.
    search[locale] = searchTextOf([
      ...names,
      ...ingredients.map((ingredient) => ingredient?.search?.[locale] ?? ""),
    ]);
  }

  return search;
};
