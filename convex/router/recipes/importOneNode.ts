"use node";
import { fetchPage } from "@convex/lib/scraping/fetchPage";
import { scrapePage } from "@convex/lib/scraping/scrapePage";
import { type RecipeDraft, type ScrapedRecipe, toRecipeDraft } from "@convex/lib/scraping/toRecipeDraft";
import { internalAction } from "@convex/procedures";
import { vRecipeDraft } from "@convex/schema/recipePayloads";
import { ConvexError, v } from "convex/values";

/**
 * The half of the import that needs a real Node runtime, and nothing else.
 *
 * `recipe-scrapers` reaches `cheerio`, whose main entry wants Node built-ins the Convex edge
 * runtime does not have, so the extraction lives behind `"use node"` and `importOne` calls it.
 * `router/ingredients/generateImageNode.ts` is the shape this copies: one file holding only the
 * action that needs the runtime, so nothing else in `router/` is dragged into that bundle.
 *
 * It carries no test of its own, deliberately and not by omission — it is a fetch, a scrape and a
 * mapping, and all three are tested where they live (`toRecipeDraft` against fixtures; `fetchPage`
 * and `scrapePage` are the network and the Node dependency this file exists to isolate). What is
 * left here is the wiring, which a test could only assert by mocking every part of it.
 */
export const _internal = internalAction({
  args: { url: v.string() },
  returns: vRecipeDraft,
  handler: async (_ctx, { url }): Promise<RecipeDraft> => {
    const html = await fetchPage(url);

    let scraped: ScrapedRecipe;
    try {
      scraped = await scrapePage(html, url);
    } catch (caught) {
      /**
       * The scraper itself came apart on this markup, which is the same ending for the cook as a
       * page carrying no recipe: nothing to read, and nothing to retry. Re-worded rather than
       * passed through, so an internal stack trace never becomes a sentence on screen.
       */
      throw caught instanceof ConvexError
        ? caught
        : new ConvexError({
            code: "UNREADABLE_PAGE" as const,
            message: "No recipe could be read on that page",
          });
    }

    return toRecipeDraft(scraped);
  },
});
