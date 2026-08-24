import { searchCatalog } from "@convex/functions/ingredients/searchCatalog";
import { publicQueryI18n } from "@convex/procedures";
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
