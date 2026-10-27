import { useLocale } from "~/hooks/useLocale";
import { api } from "~/lib/convex/api";
import { useQueryDevice } from "~/lib/convex/client";

/**
 * The cook's shelf: the recipes they favorited, newest favorite first, as cards.
 *
 * Its own hook rather than a branch of `useRecipeList`, because it answers a different question
 * from a different table: the list is what the cook WROTE and is paginated; the shelf is what
 * they KEPT, capped server-side and drawn as one row. Folding it into the list would make one
 * hook return two shapes, and the screen already knows which of the two it is drawing.
 *
 * `useQueryDevice` so the shelf survives a tab switch the way the grid beneath it does, and on the
 * device so Home draws it on a cold start and with no signal.
 */
export const useFavoriteRecipes = () => {
  const locale = useLocale();
  const query = useQueryDevice(api.router.recipes.getFavorites.authed, { locale });

  return {
    favorites: query.data ?? [],
    isLoading: query.data === undefined,
  };
};
