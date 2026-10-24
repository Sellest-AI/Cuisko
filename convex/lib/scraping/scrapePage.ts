import { getScraper } from "recipe-scrapers";

import type { ScrapedRecipe } from "./toRecipeDraft";

/**
 * The six fields we read off a page, asked for one at a time.
 *
 * ⚠️ **This module reaches `cheerio` through `recipe-scrapers`, so it may only ever be imported by
 * a `"use node"` action.** Today its one importer is `readRecipePage.ts`, under the same rule, which
 * `router/recipes/importOneNode.ts` and `router/recipes/findWebRecipe.ts` read pages through. Import
 * it from an edge-runtime function and that function stops deploying, with an error naming a Node
 * built-in rather than this line.
 *
 * ⚠️ **`scrapeRecipe` is unusable here, and this is the whole reason this file exists.** That entry
 * point extracts a fixed field set and throws `ExtractorNotFoundException` on the first one it
 * cannot find — `author` and `image` included, and many pages carry neither. A perfectly good
 * recipe page naming no author would come back as an unreadable page. `fallbackAuthor` and
 * `fallbackYield` patch two of those holes, and there is no `fallbackImage`, so the fallbacks are
 * not a way out either.
 *
 * `extract` is the public per-field entry point underneath it, so we ask for the six fields we
 * actually use and let each one fail alone.
 */

/**
 * A field that is allowed to be absent.
 *
 * Absence is the normal case for `description` and `yields`, not an error to report: `toRecipeDraft`
 * seeds a default for one and an empty string for the other, and the cook is looking straight at
 * both. Only `ingredients` and `instructions` are load-bearing, and `toRecipeDraft` is the one that
 * decides a page without them is a page with no recipe on it.
 */
const _softly = async <T>(extract: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await extract();
  } catch {
    return fallback;
  }
};

/** `wildMode` is the generic schema.org extractor, which is what carries the long tail of blogs. */
export const scrapePage = async (html: string, url: string): Promise<ScrapedRecipe> => {
  const Scraper = getScraper(url, { wildMode: true });
  const scraper = new Scraper(html, url);

  return {
    title: await _softly(() => scraper.extract("title"), ""),
    description: await _softly(() => scraper.extract("description"), ""),
    yields: await _softly(() => scraper.extract("yields"), ""),
    ingredients: await _softly(() => scraper.extract("ingredients"), []),
    instructions: await _softly(() => scraper.extract("instructions"), []),
    // For the chat's web recipe card only; `httpsImageOf` decides whether it is drawn.
    image: await _softly<string | undefined>(() => scraper.extract("image"), undefined),
  };
};
