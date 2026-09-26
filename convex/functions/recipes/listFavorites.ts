import type { Doc, Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";

import { type RecipeCard, toRecipeCards } from "./recipeCard";

type ListCtx = Pick<QueryCtx, "db">;

/**
 * How many favorites the shelf reads.
 *
 * Bounds the image reads, not the UI: the shelf is one horizontal row, and fifty favorites is
 * already an outlier. Not paginated, because a row is not scrolled to its end the way a grid is.
 */
export const FAVORITES_LIMIT = 50;

type Args = {
  userId: Id<"users">;
  locale: Locale;
  limit?: number;
};

/**
 * The caller's favorite recipes as cards, newest favorite first.
 *
 * Ordered by the favorite's creation time rather than the recipe's: the shelf answers "what did I
 * keep most recently", and a recipe written years ago is a fresh favorite the day it is kept.
 * `by_user` orders by creation time within the owner, so `.order("desc")` is the whole of it.
 *
 * A row whose recipe is gone is dropped rather than asserted. The cascade should make that
 * unreachable, but a list is not the place to find out that it did not.
 *
 * An archived recipe is dropped too, and its favorite row kept: the cook who wrote it deleted it,
 * but the row is another cook's choice, and the recipe is still there. Filtered after the read, which
 * is fine because this is a `take` and not a page — the shelf is only shorter by what was dropped.
 */
export const listFavorites = async (
  ctx: ListCtx,
  { userId, locale, limit = FAVORITES_LIMIT }: Args,
): Promise<RecipeCard[]> => {
  const favorites = await ctx.db
    .query("recipeFavorites")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .take(limit);

  const recipes = await Promise.all(favorites.map((favorite) => ctx.db.get(favorite.recipeId)));

  return toRecipeCards(
    ctx,
    recipes.filter((recipe): recipe is Doc<"recipes"> => recipe !== null && !recipe.isArchived),
    locale,
  );
};
