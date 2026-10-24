"use node";
import { readRecipePage } from "@convex/lib/scraping/readRecipePage";
import { type RecipeDraft, toRecipeDraft } from "@convex/lib/scraping/toRecipeDraft";
import { internalAction } from "@convex/procedures";
import { vRecipeDraft } from "@convex/schema/recipePayloads";
import { v } from "convex/values";

/**
 * The half of the import that needs a real Node runtime, and nothing else.
 *
 * `recipe-scrapers` reaches `cheerio`, whose main entry wants Node built-ins the Convex edge
 * runtime does not have, so the extraction lives behind `"use node"` and `importOne` calls it.
 * `router/ingredients/generateImageNode.ts` is the shape this copies: one file holding only the
 * action that needs the runtime, so nothing else in `router/` is dragged into that bundle.
 *
 * It carries no test of its own, deliberately and not by omission — it is a read of the page and
 * a mapping, and both are tested where they live (`readRecipePage`, and `toRecipeDraft` against
 * fixtures). What is left here is the wiring, which a test could only assert by mocking every part
 * of it.
 *
 * @costly
 */
export const _internal = internalAction({
  args: { url: v.string() },
  returns: vRecipeDraft,
  handler: async (_ctx, { url }): Promise<RecipeDraft> => toRecipeDraft(await readRecipePage(url)),
});
