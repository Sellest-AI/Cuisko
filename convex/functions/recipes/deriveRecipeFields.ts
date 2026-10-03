import type { MutationCtx } from "@convex/procedures";
import { type AuthoredTag, facetsOf, type RecipeFacets, type Tag } from "@shared/tags";

import { computeTags } from "./computeTags";
import type { RecipeLink } from "./resolveRecipeIngredients";

type Args = {
  /**
   * The tags somebody CHOSE for the recipe — the model at a save, the stored row at a refresh.
   * Authored only, by type: a calculated tag handed in here would survive the recipe losing the
   * fact that earned it, which is the stale `vegan` this function exists to prevent.
   */
  tags: readonly AuthoredTag[];
  servings: number;
  /**
   * What the recipe's lines resolved to — decided by the ACTION that called a save, or read back
   * from `recipeIngredients` by a refresh. Never computed here: turning a name into a row may reach
   * a dataset, a live API and a model, none of which a mutation may do.
   */
  links: RecipeLink[];
  /**
   * How many lines `links` is meant to cover. More than `links.length` means one did not resolve,
   * and `computeTags` then claims nothing.
   *
   * Stated by every caller, because each knows it differently: a save counts the recipe it was
   * handed, `updateRecipe`'s incomplete path counts the links it kept, and a refresh has only the
   * stored rows. The pair has to describe the same recipe, so whoever picks one picks both.
   */
  lineCount: number;
};

export type DerivedRecipeFields = {
  tags: Tag[];
  facets: RecipeFacets;
};

/**
 * The tags and facets a recipe's lines earn it, computed once so a save, an edit and a refresh
 * cannot compute them three different ways.
 *
 * The search blob is deliberately NOT part of this: ADR 0011 requires `recipeSearchText` to be
 * called where a `search` field is actually assigned, so C11 can verify each writer independently
 * rather than trust a bundle it cannot see into.
 */
export const deriveRecipeFields = async (
  ctx: Pick<MutationCtx, "db">,
  { tags: authored, servings, links, lineCount }: Args,
): Promise<DerivedRecipeFields> => {
  // `lineCount` is what the recipe HAS and `links` is what resolved — `computeTags` needs both,
  // because every tag it answers is a claim of absence and absence cannot be argued from a subset.
  const computed = await computeTags(ctx, {
    lines: links.map(({ ingredientId, quantity, unit, fatUse }) => ({
      ingredientId,
      quantity,
      unit,
      ...(fatUse && { fatUse }),
    })),
    lineCount,
    servings,
  });

  const tags = [...authored, ...computed];

  // A projection of `tags` rather than a second derivation, so the boolean and the tag cannot
  // disagree.
  return { tags, facets: facetsOf(tags) };
};
