import {
  createIngredient,
  type CreatedIngredient,
} from "@convex/functions/ingredients/createIngredient";
import {
  resolveIngredient,
  type ResolvedIngredient,
} from "@convex/functions/ingredients/resolveIngredient";
import { loadIngredients } from "@convex/functions/ingredients/loadIngredients";
import { rememberAlias } from "@convex/functions/ingredients/rememberAlias";
import { searchWidened } from "@convex/functions/ingredients/searchWidened";
import { withRateLimit } from "@convex/functions/rateLimits/enforceRateLimit";
import { authActionI18n, internalMutation, internalQuery } from "@convex/procedures";
import { vLocale } from "@convex/schema/i18n";
import { vIngredientFacts } from "@convex/schema/ingredientPayloads";
import { vIngredientSource } from "@convex/schema/ingredients";
import { v } from "convex/values";

/**
 * Free text a shopper typed into the navigation bar → a catalog row, or an honest refusal.
 *
 * `authed` rather than `anon` because it spends money: two fetches and up to two model calls on a
 * miss, attributed to a caller. It takes no document id, so ADR 0003's ownership question does not
 * arise — which is also why it may be a bare action rather than a mutation scheduling one (ADR:
 * prefer a mutation scheduling an action), whose trade is the one wanted here: the client AWAITS
 * this and catches its throw, because the placeholder it holds has no row to write a status onto.
 *
 * **It does not touch the grocery list.** `router/cellars/addToGroceryList.authed` does that: this
 * returns an id, and the caller adds it with the quantity and unit the shopper actually picked —
 * folding the write in here would mean inventing both.
 */
export const authed = authActionI18n({
  args: { text: v.string() },
  handler: (ctx, { text }): Promise<ResolvedIngredient> =>
    withRateLimit(ctx, "ingredientResolve", () => resolveIngredient(ctx, { text, locale: ctx.i18n.locale })),
});

/**
 * The catalog read `authed` needs from inside an action, at a widened threshold a screen would be
 * wrong to use — internal because it is one step of that operation. A screen calls `search.anon`.
 */
export const _internal_search = internalQuery({
  args: { text: v.string(), locale: vLocale },
  handler: (ctx, args) => searchWidened(ctx, args),
});

/**
 * One catalog row by id, for the arm of `authed` that links a row it did not search for. The
 * agent's `existing` verdict names a row by POSITION in the list it was handed (ADR 0010), so its
 * purchase fields normally come straight back out of that list. This is the read for when they
 * cannot — so that path returns the row's real unit rather than a plausible guess of one piece.
 */
export const _internal_load = internalQuery({
  args: { ingredientId: v.id("ingredients"), locale: vLocale },
  handler: (ctx, { ingredientId, locale }) =>
    loadIngredients(ctx, { ids: [ingredientId], locale }),
});

/**
 * The word the shopper typed, written onto the row the agent matched it to, so the next shopper to
 * type it is answered by the search and not by a model — see `rememberAlias` (ADR 0011).
 */
export const _internal_rememberAlias = internalMutation({
  args: { ingredientId: v.id("ingredients"), alias: v.string(), locale: vLocale },
  handler: (ctx, args): Promise<boolean> => rememberAlias(ctx, args),
});

/**
 * The write `authed` cannot perform itself — an action has no `ctx.db`. Internal because it is one
 * step of that operation: it inserts a row with no ownership check, and its only dedup is an exact
 * name match — safe after the four steps before it established that the catalog does not hold this
 * food. Exposed to a client it would be a catalog-growing button.
 *
 * `facts` is validated as `vIngredientFacts` and not as the table's own validator: `search`,
 * `nutriScore` and `name`'s metadata are derived, and a payload that could carry them would be a
 * payload that could get them wrong (ADR 0011).
 */
export const _internal_create = internalMutation({
  args: { facts: vIngredientFacts, source: vIngredientSource },
  handler: (ctx, { facts, source }): Promise<CreatedIngredient> =>
    createIngredient(ctx, facts, source),
});
