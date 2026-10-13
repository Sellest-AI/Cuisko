import type { Doc, Id } from "@convex/_generated/dataModel";
import { isSocialVideoLink } from "@convex/lib/socialVideo/sources";
import type { QueryCtx } from "@convex/procedures";
import type { RecipeOrigin, ReportedRecipe } from "@convex/schema/events";

/**
 * A recipe with no owner is the catalog's; an owned one is an import when it kept its address.
 *
 * A video link pasted into the editor is not kept (`createOne` leaves video addresses to
 * `importVideo`), so that recipe reads as `typed` here, though `recipe imported` called it a video.
 */
const _originOf = (recipe: Doc<"recipes">): RecipeOrigin => {
  if (!recipe.userId) return "catalog";
  if (!recipe.sourceUrl) return "typed";
  return isSocialVideoLink(recipe.sourceUrl) ? "video" : "link";
};

/**
 * A recipe as a product event carries it (ADR 0019): its id, and where it came from, so PostHog can
 * tell whether imported recipes reach a plate and a stove or only the shelf.
 *
 * Never its title: a cook's recipe is named by the cook, or by the page it came from. Only the id is
 * sent when the row is gone. From a row the writer already loaded, so the report reads nothing.
 */
export const reportedRecipeOf = (recipeId: Id<"recipes">, recipe: Doc<"recipes"> | null): ReportedRecipe =>
  recipe ? { recipeId, recipeOrigin: _originOf(recipe) } : { recipeId };

/** The same, for a writer that never loaded the recipe. */
export const reportedRecipe = async (ctx: Pick<QueryCtx, "db">, recipeId: Id<"recipes">): Promise<ReportedRecipe> =>
  reportedRecipeOf(recipeId, await ctx.db.get(recipeId));
