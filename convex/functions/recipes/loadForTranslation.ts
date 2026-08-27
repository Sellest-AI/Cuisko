import type { Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";
import type { TranslatableRecipe } from "@convex/agent/tools/translateRecipe";
import { hashText, isTranslationOutdated, resolvei18n } from "@convex/lib/i18n";
import { type Locale, type Localized, LOCALES } from "@convex/schema/i18n";
import { parseInstructions } from "@shared/recipes";

type Args = {
  recipeId: Id<"recipes">;
  /** The language the recipe was written in. Everything handed to the model is resolved from it. */
  sourceLocale: Locale;
};

export type TranslationSource = {
  /** The recipe's owner — the agent thread the translation runs on belongs to them. */
  userId: Id<"users">;
  /** The languages still missing, in the order `LOCALES` declares them. Empty means nothing to do. */
  missingLocales: Locale[];
  recipe: TranslatableRecipe;
};

/**
 * Everything one translation run needs, read in a single query.
 *
 * The ingredient list arrives as a GLOSSARY — every name the catalog already holds, in every
 * language it holds it — because that is what stops the model choosing "spring onions" in step two
 * and "scallions" in step five. It carries no quantity and no unit on purpose; see
 * `modelRecipeSchemaExtended`, where deleting those fields is what stopped two models rewriting a
 * step's amount to match the recipe's total.
 *
 * A language is missing when `isTranslationOutdated` says it is — which covers two different
 * ways a locale can be owed a run: the value was never written (a run that previously failed is
 * retried rather than mistaken for one that succeeded), or it was written once and the SOURCE has
 * since changed under it. The second is what an edit produces: `updateRecipe` only ever rewrites
 * the locale the cook edited in, so the other one keeps its old `values` and `meta` untouched and
 * would read as done forever without the hash comparison.
 *
 * Checked across all three translated fields rather than `title` alone, because they are edited
 * independently — a recipe whose method changed and whose title did not owes a retranslation for
 * exactly one of the two reasons, and checking only `title` would miss the other.
 */
export const loadForTranslation = async (
  ctx: QueryCtx,
  { recipeId, sourceLocale }: Args,
): Promise<TranslationSource> => {
  const recipe = await ctx.db.get(recipeId);
  if (!recipe) throw new Error(`loadForTranslation: recipe ${recipeId} does not exist.`);
  if (!recipe.userId) throw new Error(`loadForTranslation: recipe ${recipeId} has no owner.`);

  // Hashed once per field rather than once per (field, locale) pair — `LOCALES` is walked below
  // once per field, and the source text does not change between those walks.
  const translatedFields = [recipe.title, recipe.description, recipe.instructions].map(
    (field): [Localized, string] => [field, hashText(resolvei18n(field, sourceLocale))],
  );
  const isOutdatedSomewhere = (locale: Locale) =>
    translatedFields.some(([field, sourceHash]) => isTranslationOutdated(field, locale, sourceHash));

  const links = await ctx.db
    .query("recipeIngredients")
    .withIndex("by_recipe", (q) => q.eq("recipeId", recipeId))
    .collect();

  const ingredients = await Promise.all(
    links
      .sort((a, b) => a.position - b.position)
      .map(async ({ ingredientId }) => {
        const ingredient = await ctx.db.get(ingredientId);
        if (!ingredient)
          throw new Error(`loadForTranslation: recipe ${recipeId} links a deleted ingredient.`);
        return { names: ingredient.name.values };
      }),
  );

  return {
    userId: recipe.userId,
    missingLocales: LOCALES.filter((locale) => isOutdatedSomewhere(locale)),
    recipe: {
      title: resolvei18n(recipe.title, sourceLocale),
      description: resolvei18n(recipe.description, sourceLocale),
      instructions: parseInstructions(resolvei18n(recipe.instructions, sourceLocale)),
      servings: recipe.servings,
      difficulty: recipe.difficulty,
      cuisine: recipe.cuisine,
      tags: recipe.tags,
      equipments: recipe.equipments,
      timings: recipe.timings,
      ingredients,
    },
  };
};
