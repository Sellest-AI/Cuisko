import { ConvexError } from "convex/values";

import { fetchPage } from "./fetchPage";
import { scrapePage } from "./scrapePage";
import type { ScrapedRecipe } from "./toRecipeDraft";

/**
 * The recipe on the page at `url`, as the scraper reads it: one fetch, one scrape.
 *
 * ⚠️ **This module reaches `cheerio` through `scrapePage`, so it may only ever be imported by a
 * `"use node"` action**: `router/recipes/importOneNode` (the editor's import) and
 * `router/recipes/findWebRecipe` (the chat's preview). Both read a page through here, so a page is
 * readable for the chat's card exactly when it is readable for its Add.
 *
 * Throws `fetchPage`'s errors untouched, and `UNREADABLE_PAGE` when the scraper itself comes apart
 * on the markup: the same ending for the cook as a page carrying no recipe, nothing to read and
 * nothing to retry. Re-worded rather than passed through, so an internal stack trace never becomes
 * a sentence on screen.
 */
export const readRecipePage = async (url: string): Promise<ScrapedRecipe> => {
  const html = await fetchPage(url);

  try {
    return await scrapePage(html, url);
  } catch (caught) {
    throw caught instanceof ConvexError
      ? caught
      : new ConvexError({
          code: "UNREADABLE_PAGE" as const,
          message: "No recipe could be read on that page",
        });
  }
};
