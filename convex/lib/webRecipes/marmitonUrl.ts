/**
 * Marmiton's addresses: which pages are recipes, and the one search URL we send.
 *
 * Apart from `marmiton.ts` because that file reaches `cheerio` and this one must not: `importWeb`
 * runs in the edge runtime and gates its url here. The search page parser and the gate keep one
 * definition of a recipe page between them.
 */

export const MARMITON_ORIGIN = "https://www.marmiton.org";

/** A recipe page's path. The search also returns editorial pages (`/shopping/`, `/focus-ingredient/`). */
export const RECIPE_PATH = /^\/recettes\/recette_/;

/**
 * Whether `url` is a Marmiton recipe page: `https:`, on `www.marmiton.org` exactly (not a host
 * that merely starts with it), and a recipe's path. Any spelling `URL` reads; not a URL is not one.
 */
export const isMarmitonRecipeUrl = (url: string): boolean => {
  let page: URL;
  try {
    page = new URL(url);
  } catch (caught) {
    if (caught instanceof TypeError) return false;
    throw caught;
  }

  return page.origin === MARMITON_ORIGIN && RECIPE_PATH.test(page.pathname);
};

/**
 * The search for `dish`, as the one URL this code sends to Marmiton.
 *
 * `aqt` alone: Marmiton's robots.txt allows `recherche.aspx?aqt=` but disallows any `aqt=*page*`,
 * so neither the catalog script nor the chat ever paginates (checked 2026-10-24). Spelled once,
 * here, so that check covers one definition.
 */
export const searchUrlOf = (dish: string): string =>
  `${MARMITON_ORIGIN}/recettes/recherche.aspx?aqt=${encodeURIComponent(dish)}`;
