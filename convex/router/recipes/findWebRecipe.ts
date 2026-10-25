"use node";
import type { FoundWebRecipe } from "@shared/assistant";
import { ConvexError, type Infer, v } from "convex/values";

import { internal } from "@convex/_generated/api";
import type { AssertTrue, Exact } from "@convex/agent/utils/exact";
import { findWebRecipe } from "@convex/functions/webRecipes/findWebRecipe";
import { captureEvent } from "@convex/lib/posthog/captureEvent";
import { captureException } from "@convex/lib/posthog/captureException";
import { fetchPage } from "@convex/lib/scraping/fetchPage";
import { readRecipePage } from "@convex/lib/scraping/readRecipePage";
import { internalAction } from "@convex/procedures";
import { vFoundWebRecipe } from "@convex/schema/assistantPayloads";
import { vLocale } from "@convex/schema/i18n";

/** Step 0 reads a handful: the first few titles of this cook's ranking are where the dish would be. */
const KNOWN_BY_TITLE_LIMIT = 5;

/**
 * The validator and the shared type, held equal both ways: the handler's return annotation alone
 * would let a field added to `WebRecipe` and forgotten in `vFoundWebRecipe` typecheck, then fail
 * Convex's return check on every "found" answer.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- a compile-time assertion, read by tsc alone
type _Pinned = AssertTrue<Exact<Infer<typeof vFoundWebRecipe>, FoundWebRecipe>>;

/**
 * A recipe for the dish the cook asked the chat for (`findWebRecipe`): one Cuisko holds, a Marmiton
 * page that names it and clears `CHAT_BAR`, or none.
 *
 * `"use node"` because the search page is parsed with `cheerio` and the recipe page is read with
 * `recipe-scrapers`. This file is the wiring around `findWebRecipe`: the two requests through
 * `fetchPage`'s guards, and the two lookups, which an action reaches only through queries. Called
 * from the chat's edge tool with `ctx.runTracedAction`, as `verifyRecipe` calls `importOneNode`.
 *
 * Every search that reaches an outcome is reported as `web recipe searched`, under the cook. A search
 * that failed (Marmiton down, or its markup changed) also goes to Error tracking, then throws
 * `EXTERNAL_SERVICE_ERROR`: the model reads it and gives the old answer. A catalog lookup that
 * throws is Convex failing, not Marmiton: it rejects the action unreported, and Convex logs it.
 *
 * `userId` is the cook the catalog is ranked for, as `searchRecipes` passes it; the tool's factory
 * closes over it.
 *
 * @costly
 */
export const _internal = internalAction({
  args: {
    dish: v.object({ fr: v.string(), en: v.string() }),
    locale: vLocale,
    userId: v.id("users"),
  },
  returns: vFoundWebRecipe,
  handler: async (ctx, { dish, locale, userId }): Promise<FoundWebRecipe> => {
    const { result, event, error } = await findWebRecipe(dish, locale, {
      knownByTitle: (query) =>
        ctx.runQuery(internal.router.recipes.search._internal, { query, userId, locale, limit: KNOWN_BY_TITLE_LIMIT }),
      fetch: (url) => fetchPage(url, { notFound: "null" }),
      readPage: readRecipePage,
      knownBySource: async (sourceUrl) =>
        (await ctx.runQuery(internal.router.recipes.findBySource._internal, { sourceUrl }))?.recipeId ?? null,
    });

    await captureEvent(ctx, { event: "web recipe searched", distinctId: userId, properties: event });

    if (!result) {
      await captureException(ctx, {
        error,
        distinctId: userId,
        properties: { source: "marmiton", reason: event.reason, feature: "web recipe search" },
      });
      throw new ConvexError({ code: "EXTERNAL_SERVICE_ERROR" as const, message: "Marmiton could not be searched" });
    }
    return result;
  },
});
