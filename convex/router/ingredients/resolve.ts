import type { Id } from "@convex/_generated/dataModel";
import { createIngredient } from "@convex/functions/ingredients/createIngredient";
import {
  resolveIngredient,
  type ResolvedIngredient,
} from "@convex/functions/ingredients/resolveIngredient";
import { loadIngredients } from "@convex/functions/ingredients/loadIngredients";
import { searchWidened } from "@convex/functions/ingredients/searchWidened";
import { authActionI18n, internalMutation, internalQuery } from "@convex/procedures";
import { vLocale } from "@convex/schema/i18n";
import { vIngredientFacts } from "@convex/schema/ingredientPayloads";
import { vIngredientSource } from "@convex/schema/ingredients";
import { v } from "convex/values";

/**
 * Free text a shopper typed into the navigation bar → a catalog row, or an honest refusal.
 *
 * `authed` rather than `anon` because it spends money: two outbound fetches and up to two model
 * calls on a miss, and the agent attributes them to a caller. It takes no document id, so ADR
 * 0003's ownership question does not arise — which is also why it may be a bare action rather
 * than a mutation scheduling one (ADR: prefer a mutation scheduling an action).
 * The trade that record names is the one wanted here: the client AWAITS this and catches its
 * throw, because the placeholder it is holding has no row to write a status onto.
 *
 * **It does not touch the grocery list.** Adding the resolved ingredient is
 * `router/cellars/addToGroceryList.authed`, unchanged — this returns an id and the caller adds it
 * with the quantity and unit the shopper actually picked. Folding the write in here would mean
 * inventing both.
 */
export const authed = authActionI18n({
  args: { text: v.string() },
  handler: (ctx, { text }): Promise<ResolvedIngredient> =>
    resolveIngredient(ctx, { text, locale: ctx.i18n.locale }),
});

/**
 * The catalog read `authed` needs from inside an action. Internal because it is one step of that
 * operation and means nothing on its own — the widened threshold that makes it useful here would
 * be wrong for anything a screen called directly, which is `search.anon`.
 */
export const _internal_search = internalQuery({
  args: { text: v.string(), locale: vLocale },
  handler: (ctx, args) => searchWidened(ctx, args),
});

/**
 * One catalog row by id, for the arm of `authed` that links a row it did not search for.
 *
 * The agent's `existing` verdict names a row by its POSITION in the list it was handed (ADR 0010),
 * so its purchase fields are normally read straight back out of that list. This is the read for
 * when they cannot be — and it exists so that path returns the row's real unit rather than a
 * plausible-looking guess of one piece, which is the exact defect the nullable unit removed.
 */
export const _internal_load = internalQuery({
  args: { ingredientId: v.id("ingredients"), locale: vLocale },
  handler: (ctx, { ingredientId, locale }) =>
    loadIngredients(ctx, { ids: [ingredientId], locale }),
});

/**
 * The write `authed` cannot perform itself — an action has no `ctx.db`.
 *
 * Internal because it is one step of that operation: it inserts a row with no ownership check and
 * no dedup, which is only safe after the four steps before it have established that the catalog
 * does not already hold this food. Exposed to a client it would be a duplicate-ingredient button.
 *
 * `facts` is validated as `vIngredientFacts` and not as the table's own validator, deliberately:
 * `search`, `nutriScore` and `name`'s translation metadata are derived, and a payload that could
 * carry them would be a payload that could get them wrong (ADR 0011).
 */
export const _internal_create = internalMutation({
  args: { facts: vIngredientFacts, source: vIngredientSource },
  handler: (ctx, { facts, source }): Promise<Id<"ingredients">> =>
    createIngredient(ctx, facts, source),
});
