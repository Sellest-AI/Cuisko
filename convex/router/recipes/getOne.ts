import { loadRecipe } from "@convex/functions/recipes/loadRecipe";
import { authQueryI18n, internalQuery } from "@convex/procedures";
import { vLocale } from "@convex/schema/i18n";
import { ConvexError, v } from "convex/values";

/**
 * One recipe, in full, for any signed-in cook — theirs or not.
 *
 * `authQueryI18n` rather than `ownedQueryI18n`, and that is the access model, not an oversight
 * (ADR 0014): a recipe is readable by id by anyone signed in, which is what sharing a link and
 * favoriting a catalog recipe both mean. What stays gated is gated where it happens — `updateOne`
 * checks ownership before a write, `getAll` and `search` list only the caller's own. The payload
 * carries `isOwned` for the screen to hide the pencil, and never the owner's `userId`.
 */
export const authed = authQueryI18n({
  args: { id: v.id("recipes") },
  handler: (ctx, { id }) =>
    loadRecipe(ctx, { recipe: id, locale: ctx.i18n.locale, viewerId: ctx.userId }),
});

/**
 * The same recipe, for a trusted internal caller rather than the cook who owns it — a cron, an
 * admin tool, or a public action (like `updateOne`) acting on a recipe id it was handed.
 *
 * `userId` rides along here and nowhere else: `authed` deliberately never exposes it, because a
 * client-facing payload has no business carrying it — it ships the derived `isOwned` instead. This
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
