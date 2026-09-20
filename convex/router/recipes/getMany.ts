import { loadRecipeCards } from "@convex/functions/recipes/loadRecipeCards";
import { authQueryI18n } from "@convex/procedures";
import { v } from "convex/values";

/**
 * The most cards one call will resolve.
 *
 * **The bound lives here and not only at the caller.** The assistant's tool asks for five, but
 * `ids` arrives from a client and nothing about this signature stops it holding ten thousand —
 * each one costing a document read plus up to two image reads. A cap at the router is the
 * difference between a limit the honest caller respects and a limit that holds.
 *
 * Generous against every real use: three times what the tool returns, so a row of cards is never
 * silently short, and well under anything a screen would draw.
 */
const MAX_CARDS = 16;

/**
 * Several recipes by id, as cards, in the order they were asked for.
 *
 * `authQueryI18n` and not an owned builder, for the reason `search.authed` gives: a recipe is
 * readable by any signed-in cook (ADR 0014), so there is no ownership question to answer — the
 * caller passing ids they did not write is the normal case, not the attack. The assistant's recipe
 * cards are exactly that: ids the catalog returned, which may belong to anyone.
 *
 * **Ids rather than the cards themselves is what keeps a transcript honest.** The assistant's
 * `searchRecipes` tool stores only ids in its message, and this resolves them at read time — so a
 * recipe renamed, re-covered or translated since the conversation happened is drawn as it is now.
 * Storing finished cards in the message would have been one fewer query and a transcript full of
 * snapshots that quietly stop matching the recipes they open.
 */
export const authed = authQueryI18n({
  args: { ids: v.array(v.id("recipes")) },
  handler: (ctx, { ids }) =>
    // Trimmed rather than rejected: the ids are ranked, so the ones kept are the ones that
    // mattered, and a conversation drawing a card row is not the place to surface an argument
    // error the shopper cannot act on.
    loadRecipeCards(ctx, { ids: ids.slice(0, MAX_CARDS), locale: ctx.i18n.locale }),
});
