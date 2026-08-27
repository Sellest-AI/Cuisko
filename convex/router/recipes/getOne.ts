import { loadRecipe } from "@convex/functions/recipes/loadRecipe";
import { internalQuery, ownedQueryI18n } from "@convex/procedures";
import { vLocale } from "@convex/schema/i18n";
import { ConvexError, v } from "convex/values";

/**
 * One recipe the caller owns, in full.
 *
 * `ownedQueryI18n` is what makes the ownership check unforgettable rather than remembered: it takes
 * the `id` argument, loads the row, asserts the caller owns it, and hands it over as `ctx.doc`.
 * The handler below has no path that runs without that having happened, so there is no version of
 * this file that reads a stranger's recipe by passing their id.
 */
export const authed = ownedQueryI18n("recipes")({
  args: {},
  handler: (ctx) => loadRecipe(ctx, { recipe: ctx.doc, locale: ctx.i18n.locale }),
});

/**
 * The same recipe, for a trusted internal caller rather than the cook who owns it — a cron, an
 * admin tool, or a public action (like `updateOne`) acting on a recipe id it was handed.
 *
 * `userId` rides along here and nowhere else: `loadRecipe`/`authed` deliberately never expose it
 * (see the `⚠️` on `loadRecipe`), because a client-facing payload has no business carrying it. This
 * export is not client-facing — `internal.*` is never reachable from outside a Convex deployment —
 * so the same omission would just be a caller reaching for `ctx.db.get` a second time to get the
 * one field `loadRecipe` withheld.
 *
 * ⚠️ This export does NOT check ownership, and must not start: a cron, a migration and the
 *    translation job all read recipes nobody has asked for, and gating an internal read on a
 *    `userId` would make it useless to the callers it exists for. `userId` comes back so that a
 *    caller ACTING FOR A COOK can compare it — that comparison is the caller's, and a public
 *    action that skips it is an IDOR. See ADR 0003 §"Actions", which records why an action cannot
 *    have this guaranteed for it the way `ownedQuery` guarantees it for a query.
 */
export const _internal = internalQuery({
  args: { locale: vLocale, id: v.id("recipes") },
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.id);
    if (!recipe) throw new ConvexError({ code: "NOT_FOUND", message: "Recipe not found" });

    const loadedRecipe = await loadRecipe(ctx, { recipe, locale: args.locale });

    return {
      ...loadedRecipe,
      userId: recipe.userId,
    };
  },
});
