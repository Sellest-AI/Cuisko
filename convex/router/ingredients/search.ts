import { searchCatalog } from "@convex/functions/ingredients/searchCatalog";
import { internalQuery, publicQueryI18n } from "@convex/procedures";
import { vLocale } from "@convex/schema/i18n";
import { v } from "convex/values";

/**
 * Anonymous on purpose: the catalog is reference data, identical for every caller, and the
 * navigation bar searches it before a shopper has signed in.
 */
export const anon = publicQueryI18n({
  args: {
    query: v.string(),
  },
  handler: (ctx, { query }) => searchCatalog(ctx, { query, locale: ctx.i18n.locale }),
});

/**
 * The same search, for the assistant's `searchIngredients` tool.
 *
 * Internal although `anon` is public, because the tool runs inside a scheduled action that has no
 * client locale for `publicQueryI18n` to read: the locale is the turn's, closed over by the tool,
 * and `limit` is the tool's to keep small — a model pays for every row it reads.
 */
export const _internal = internalQuery({
  args: { query: v.string(), locale: vLocale, limit: v.number() },
  handler: (ctx, args) => searchCatalog(ctx, args),
});
