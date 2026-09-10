import type { MutationCtx } from "@convex/procedures";
import type { SanitizedRecipe } from "@convex/agent/tools/sanitizeRecipe";
import { facetsOf, type RecipeFacets, type Tag } from "@shared/tags";

import { computeTags } from "./computeTags";
import type { RecipeLink } from "./resolveRecipeIngredients";

type Args = {
  recipe: SanitizedRecipe;
  /**
   * What the recipe's lines resolved to, decided by the ACTION that called this writer.
   *
   * An argument rather than something computed here, and that is the whole of this slice: turning
   * a name into a row may reach a dataset, a live API and a model, none of which a mutation may
   * do. By the time this runs the answer is already bought.
   */
  links: RecipeLink[];
  /**
   * How many lines `links` is meant to cover. Defaults to the recipe's own line count, which is
   * right for every write that resolved the recipe it is storing.
   *
   * Stated separately because `updateRecipe` has one case where it is NOT the recipe's count: when
   * a resolve came back incomplete it keeps the row's PREVIOUS links, and holding those against the
   * edited recipe's line count would read as "a line did not resolve" — which makes `computeTags`
   * return nothing at all and wipes the tags the substitution exists to protect. The pair has to
   * describe the same recipe, so the caller that substitutes one substitutes both.
   */
  lineCount?: number;
};

export type DerivedRecipeFields = {
  tags: Tag[];
  facets: RecipeFacets;
};

/**
 * The matches, tags and facets a `SanitizedRecipe` has to become before it can sit in the
 * `recipes` table, computed once so an insert and an update cannot compute them two different ways.
 *
 * This was `saveRecipe`'s body until an edit needed the same values against a row already in the
 * table — computing the tags a model cannot author is a read-only question about the recipe's
 * CONTENT, and asking it again here is what let `updateRecipe` stop being a second copy of the
 * answer.
 *
 * The search blob is deliberately NOT one of the three: ADR 0011 requires `recipeSearchText` to be
 * called where a `search` field is actually assigned, so C11 can verify each writer independently
 * rather than trust a bundle it cannot see into. `saveRecipe` and `updateRecipe` each call it
 * themselves, from the `links` they were handed.
 */
export const deriveRecipeFields = async (
  ctx: Pick<MutationCtx, "db">,
  { recipe, links, lineCount }: Args,
): Promise<DerivedRecipeFields> => {
  // `lineCount` is what the recipe HAS and `links` is what resolved — `computeTags` needs both,
  // because every tag it answers is a claim of absence and absence cannot be argued from a subset.
  const computed = await computeTags(ctx, {
    lines: links.map(({ ingredientId, quantity, unit }) => ({ ingredientId, quantity, unit })),
    lineCount: lineCount ?? recipe.ingredients.length,
    servings: recipe.servings,
  });

  const tags = [...recipe.tags, ...computed];

  // A projection of `tags` rather than a second derivation, so the boolean and the tag cannot
  // disagree.
  return { tags, facets: facetsOf(tags) };
};
