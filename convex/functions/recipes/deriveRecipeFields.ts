import type { MutationCtx } from "@convex/procedures";
import type { SanitizedRecipe } from "@convex/agent/tools/sanitizeRecipe";
import type { Locale } from "@shared/translations";
import { facetsOf, type RecipeFacets, type Tag } from "@shared/tags";

import { matchIngredients, type MatchedIngredient } from "../ingredients/matchIngredients";
import { computeTags, type TaggableLine } from "./computeTags";

type Args = {
  locale: Locale;
  recipe: SanitizedRecipe;
};

export type DerivedRecipeFields = {
  /** One match per ingredient line, in the order `recipe.ingredients` gave them. */
  matches: MatchedIngredient[];
  tags: Tag[];
  facets: RecipeFacets;
};

/**
 * The matches, tags and facets a `SanitizedRecipe` has to become before it can sit in the
 * `recipes` table, computed once so an insert and an update cannot compute them two different ways.
 *
 * This was `saveRecipe`'s body until an edit needed the same three values against a row already in
 * the table — matching ingredients and computing the tags a model cannot author are read-only
 * questions about the recipe's CONTENT, and asking them again here is what let `updateRecipe` stop
 * being a second copy of the answer.
 *
 * The search blob is deliberately NOT one of the three: ADR 0011 requires `recipeSearchText` to be
 * called where a `search` field is actually assigned, so C11 can verify each writer independently
 * rather than trust a bundle it cannot see into. `saveRecipe` and `updateRecipe` each call it
 * themselves, from the `matches` this returns.
 */
export const deriveRecipeFields = async (
  ctx: Pick<MutationCtx, "db">,
  { locale, recipe }: Args,
): Promise<DerivedRecipeFields> => {
  const matches = await matchIngredients(ctx, {
    names: recipe.ingredients.map(({ name }) => name),
    locale,
  });

  // Over every line the recipe has, matched or not — `computeTags` needs the unmatched ones to
  // know it cannot answer. The links a caller inserts are the matched subset, which is a different
  // question and deliberately a narrower one.
  const computed = await computeTags(ctx, {
    lines: recipe.ingredients
      .map((line, index) => {
        const match = matches[index];
        return {
          ingredientId: match?.status === "matched" ? match.ingredientId : undefined,
          quantity: line.quantity,
          unit: line.unit,
        };
      })
      .filter((line): line is TaggableLine => line.ingredientId !== undefined),
    lineCount: recipe.ingredients.length,
    servings: recipe.servings,
  });

  const tags = [...recipe.tags, ...computed];

  // A projection of `tags` rather than a second derivation, so the boolean and the tag cannot
  // disagree.
  return { matches, tags, facets: facetsOf(tags) };
};
