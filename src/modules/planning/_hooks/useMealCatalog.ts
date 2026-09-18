import { useMemo } from "react";

import { useRecipe, useRecipeList } from "~/modules/recipes/hooks";

import type { ImageSource } from "../_model/model";

/** One tile of the meal sheet's grid: a dish that could go on the plate. */
export type MealChoice = {
  id: string;
  title: string;
  imageSrc?: ImageSource;
};

/** One identity for "none", so a sheet without alternatives does not rebuild the grid every render. */
const NO_ALTERNATIVES: MealChoice[] = [];

/** The plate's picture where there is one, the cover otherwise; the screen draws the empty plate for neither. */
const _imageOf = (recipe: { plateImageUrl?: string; coverImageUrl?: string }): ImageSource | undefined => {
  const url = recipe.plateImageUrl ?? recipe.coverImageUrl;

  return url ? { uri: url } : undefined;
};

/**
 * The dishes the meal sheet offers: the one already on the plate first, then the plate's
 * alternatives, then the cook's own library — or, under a term, what it narrows the catalog to.
 *
 * **The grid is the recipes page's grid.** `useRecipeList` is what decides whether an empty box
 * shows the cook's own recipes or a term's ranked matches, and the ranking — own first, the cook's
 * diet next — is the server's. Nothing here sorts; this hook only pins.
 *
 * **Pinning is client-side, and by a separate read.** The dish on the plate is the first tile
 * whatever is typed, and the list has no reason to contain it: a term that does not match it, or
 * a library it is not part of, leave it out. `useRecipe` reads that one recipe — a read every
 * recipe screen shares, so a dish tapped from the plan is most often already cached — and it is
 * put in front of the list, once. The list's own copy, when there is one, is dropped rather than
 * drawn twice.
 *
 * While the pinned recipe is still being asked for, the list stands alone rather than waiting: a
 * grid that appears is better than one that blinks in later, and the pinned tile takes the front
 * when it lands.
 *
 * **Alternatives follow the pinned tile while no term narrows the grid.** They are the runners-up
 * a generated plate was ranked with, handed in already ranked; a term means the cook wants
 * something else, so the matches stand alone. Keyed on `isSearching` rather than on the raw text,
 * so they leave exactly when the grid turns into matches and not a debounce earlier. Each recipe
 * is drawn once: the pinned tile wins, then the alternative, then the list.
 */
export const useMealCatalog = (query: string, pinnedRecipeId?: string, alternatives: MealChoice[] = NO_ALTERNATIVES) => {
  const list = useRecipeList(query);
  const pinned = useRecipe(pinnedRecipeId);

  const recipes = useMemo((): MealChoice[] => {
    const head: MealChoice[] = [
      ...(pinned.recipe ? [{ id: pinned.recipe.id, title: pinned.recipe.title, imageSrc: _imageOf(pinned.recipe) }] : []),
      ...(list.isSearching ? [] : alternatives),
    ];
    const drawn = new Set<string>();
    const choices = [
      ...head,
      ...list.recipes.map((recipe) => ({ id: recipe.id, title: recipe.title, imageSrc: _imageOf(recipe) })),
    ];

    return choices.filter((choice) => {
      if (drawn.has(choice.id)) return false;
      drawn.add(choice.id);

      return true;
    });
  }, [list.recipes, list.isSearching, pinned.recipe, alternatives]);

  return {
    recipes,
    /** Whether a term is narrowing the grid — the screen names the section after it. */
    isSearching: list.isSearching,
    isLoading: list.isLoading,
    /** True only while a previous set of matches stands in for one still in flight. */
    isStale: list.isStale,
  };
};
