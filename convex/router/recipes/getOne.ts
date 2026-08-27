import { loadRecipe } from "@convex/functions/recipes/loadRecipe";
import { ownedQueryI18n } from "@convex/procedures";

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
