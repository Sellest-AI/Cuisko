import type { Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";
import type { TranslatableRecipe } from "@convex/agent/tools/translateRecipe";
import { hasTranslation, resolvei18n } from "@convex/lib/i18n";
import { type Locale, LOCALES } from "@convex/schema/i18n";
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
 * A language is missing when `hasTranslation` says so rather than when the value is absent, so a
 * run that previously failed is retried instead of being mistaken for one that succeeded.
 */
export const loadForTranslation = async (
  ctx: QueryCtx,
  { recipeId, sourceLocale }: Args,
): Promise<TranslationSource> => {
  const recipe = await ctx.db.get(recipeId);
  if (!recipe) throw new Error(`loadForTranslation: recipe ${recipeId} does not exist.`);
  if (!recipe.userId) throw new Error(`loadForTranslation: recipe ${recipeId} has no owner.`);

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
    missingLocales: LOCALES.filter((locale) => !hasTranslation(recipe.title, locale)),
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
