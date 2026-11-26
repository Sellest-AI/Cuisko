import type { QueryCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";
import type { Cuisine } from "@shared/cuisines";
import { seedOfDayKey } from "@shared/dates";

import { type RecipeCard, toRecipeCards } from "./recipeCard";
import { shuffledWindow } from "./shuffledWindow";

/** How many recipes the Explore page shows with no cuisine picked: twelve rows of the grid. */
export const FEATURED_SIZE = 24;

/** How many it shows for one cuisine: every one the largest has today (54), with room to grow. */
export const CUISINE_SIZE = 60;

/**
 * The Explore page's grid for one day: the catalog's featured recipes, or one cuisine's.
 *
 * Catalog only, and by construction rather than by a check: both ranges start with
 * `userId = undefined`, so no cook's own recipe is ever read, which is what lets a guest call it
 * (ADR 0014). Seeded by the day's key, so every visit that day sees the same grid and the next
 * day sees another, with nothing stored and no cron.
 *
 * Every catalog recipe is shown, desserts, sides and sauces included: the page is a catalog to
 * browse, not the week's dinners, and a dessert is something a cook comes here to find.
 *
 * @limitation A fixed page, no infinite scroll: the day's order wraps around the index in two
 * reads, which one cursor cannot carry (`shuffledWindow`). The catalog is small enough that a page
 * of 24, or a cuisine whole, is the page.
 */
export const catalogShelf = async (
  ctx: Pick<QueryCtx, "db">,
  { dayKey, cuisine, locale }: { dayKey: string; cuisine?: Cuisine; locale: Locale },
): Promise<RecipeCard[]> => {
  const seed = seedOfDayKey(dayKey);

  const recipes = cuisine
    ? await shuffledWindow(ctx, {
        range: { index: "by_user_and_is_archived_and_cuisine_and_shuffle_key", userId: undefined, cuisine },
        seed,
        size: CUISINE_SIZE,
      })
    : await shuffledWindow(ctx, {
        range: { index: "by_user_and_is_archived_and_shuffle_key", userId: undefined },
        seed,
        size: FEATURED_SIZE,
      });

  return toRecipeCards(ctx, recipes, locale);
};
