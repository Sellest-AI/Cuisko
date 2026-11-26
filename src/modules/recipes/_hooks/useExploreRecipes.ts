import { useState } from "react";

import type { Cuisine } from "@shared/cuisines";
import { toDateParam } from "@shared/dates";

import { useLocale } from "~/hooks/useLocale";
import { api } from "~/lib/convex/api";
import { useQueryDevice } from "~/lib/convex/client";

/** A card as the Explore grid draws it: the router's `RecipeCard`, restated structurally (ADR 0002). */
type ExploreRecipe = {
  id: string;
  title: string;
  cuisine: Cuisine;
  /** Preparation, cooking and resting added up: the card's subtitle. Absent when none is stated. */
  minutes?: number;
  coverImageUrl?: string;
};

/** One identity for "none yet", so the grid does not get a new array on every render while it loads. */
const NO_RECIPES: ExploreRecipe[] = [];

/**
 * The Explore page's grid: the catalog's featured recipes for today, or one cuisine's.
 *
 * The key is the device's local day, computed once per mount, as `useWeekIdeas` computes its
 * Monday: a page left open across midnight keeps its grid until it is next opened.
 *
 * `hold` keeps the previous cuisine's grid on screen while the next one loads (`isStale`), and the
 * day is `loose`, so the copy on the device is found by cuisine alone: yesterday's grid serves an
 * offline visit today. The query is `anon`, so a guest gets the same grid.
 */
export const useExploreRecipes = (cuisine: Cuisine | undefined) => {
  const locale = useLocale();
  const [dayKey] = useState(() => toDateParam(new Date()));

  const { data, isStale } = useQueryDevice(
    api.router.recipes.getCatalog.anon,
    { locale, dayKey, cuisine },
    { hold: true, loose: ["dayKey"] },
  );

  return {
    recipes: (data as ExploreRecipe[] | undefined) ?? NO_RECIPES,
    /** The first answer only: once a grid is up, a cuisine change is `isStale`, not loading. */
    isLoading: data === undefined,
    isStale,
  };
};
