/**
 * Which recipe a search contributes, for any source. Each source has its own bar, because a count
 * of reviews means something different on each site: a Marmiton "avis" is cheap to leave, a BBC
 * Good Food rating is not. What happens once a bar is set is the same everywhere, and lives here.
 */
import { matchesDish, type MatchOptions } from "./dishMatch";

export type Bar = { readonly minReviews: number; readonly minRating: number };

/**
 * The bar a Marmiton page clears to answer a cook who asked the chat for a dish by name.
 *
 * Lower than the catalog's `MARMITON_BAR` (30 reviews, 4.5), on purpose: a dish the catalog lacks
 * is often one the catalog script already looked up and rejected for its rating, so its bar would
 * answer "none" for exactly the dishes the chat's search exists for. What every cook draws from
 * stays stricter than what one cook asked for by name. Tuned from the `web recipe searched` event's
 * nearest misses (`nearestMissRating` × `nearestMissReviews` on `outcome: "none"`, in PostHog):
 * change these two numbers, ship.
 */
export const CHAT_BAR = { minReviews: 5, minRating: 4.0 } as const satisfies Bar;

/** One recipe a search found, with the two numbers every bar is made of. */
export type RatedRecipe = {
  /** Canonical, via `canonicalUrlOf`: the spelling `importOne` stores as `sourceUrl`. */
  url: string;
  title: string;
  /** Out of 5. 0 when the recipe shows no rating. */
  rating: number;
  /** 0 when the recipe shows none. */
  reviews: number;
};

export type Verdict = "accepted" | "skipped" | "rejected";

/** Whether a recipe clears `bar`. Both thresholds are inclusive. */
export const passes = (recipe: Pick<RatedRecipe, "rating" | "reviews">, bar: Bar): boolean =>
  recipe.reviews >= bar.minReviews && recipe.rating >= bar.minRating;

/**
 * The one recipe a search for `dish` contributes: among the recipes that clear the bar AND name the
 * dish (`matchesDish`), the one with the most reviews.
 *
 * One search, one recipe. A page is ranked for relevance and popularity, not quality, and a
 * popular dish fills it with near-copies ("bolognaise", "bolognaise très facile", "bolognaise
 * express"). Variations come from searching the variation by name, not from taking more of the page.
 *
 * The title check comes first because a search is fuzzy: without it, "mafé" keeps "Madeleines au
 * miel", the most reviewed card on its Marmiton page.
 *
 * Most reviews rather than best rating, since everything here has already cleared the rating bar
 * and a 4.9 over 57 reviews says less than a 4.8 over 1,429. Ties go to the higher rating, then to
 * the order found. `undefined` when no recipe both clears the bar and names the dish.
 */
export const bestOf = <R extends RatedRecipe>(
  recipes: readonly R[],
  dish: string,
  bar: Bar,
  matching?: MatchOptions,
): R | undefined =>
  recipes
    .filter((recipe) => passes(recipe, bar) && matchesDish(recipe.title, dish, matching))
    .reduce<R | undefined>(
      (best, recipe) =>
        !best ||
          recipe.reviews > best.reviews ||
          (recipe.reviews === best.reviews && recipe.rating > best.rating)
          ? recipe
          : best,
      undefined,
    );

/**
 * Every recipe of one search with what the ledger records for it: `bestOf` is "accepted", any
 * other recipe clearing the bar is "skipped", and the rest are "rejected". In the order found.
 *
 * Skipped recipes are kept apart from rejected ones because they passed: a later search for the
 * variation they name can still accept them (`recordSearch`).
 */
export const classify = <R extends RatedRecipe>(
  recipes: readonly R[],
  dish: string,
  bar: Bar,
  matching?: MatchOptions,
): (R & { verdict: Verdict })[] => {
  const best = bestOf(recipes, dish, bar, matching);

  return recipes.map((recipe) => ({
    ...recipe,
    verdict: recipe === best ? "accepted" : passes(recipe, bar) ? "skipped" : "rejected",
  }));
};
