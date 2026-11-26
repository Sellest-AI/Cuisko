import { v } from "convex/values";

import { catalogShelf } from "@convex/functions/recipes/catalogShelf";
import { publicQueryI18n } from "@convex/procedures";
import { vCuisine } from "@convex/schema/recipePayloads";

/**
 * The Explore page's grid: the catalog's recipes for one day, or one cuisine's.
 *
 * Open on purpose, and the one list that is (ADR 0014): it reads only the catalog, rows with no
 * owner, so it reaches no cook's recipe with or without an account. A signed-in cook calls the
 * same export, since a session changes nothing in a list nobody owns.
 *
 * `dayKey` is the client's local day (`toDateParam`), as `getWeekIdeas` takes the client's Monday:
 * the server derives the seed from it. Any string is accepted, because a forged one only picks
 * another order of public rows.
 */
export const anon = publicQueryI18n({
  args: { dayKey: v.string(), cuisine: v.optional(vCuisine) },
  handler: (ctx, args) => catalogShelf(ctx, { ...args, locale: ctx.i18n.locale }),
});
