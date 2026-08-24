import type { Doc } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";

import { type CatalogIngredient, toCatalogIngredient } from "./catalogIngredient";

type SearchCtx = Pick<QueryCtx, "db">;

/** One screenful of suggestions — the navigation bar shows a short list, not a result page. */
const DEFAULT_LIMIT = 12;

/**
 * Picks the index the locale is spelled in.
 *
 * A search index is per-locale — `search_fr` holds French names and their synonyms, `search_en`
 * English ones — so choosing between them is the one decision that can only be made from the
 * locale. Written as a `switch` rather than a computed index name for two reasons: Convex types
 * the `searchField` argument against the index it is given, and adding a third locale then fails
 * to compile here (no return on that path) instead of silently searching the English index.
 */
const _matchingRows = (
  ctx: SearchCtx,
  term: string,
  locale: Locale,
  limit: number,
): Promise<Doc<"ingredients">[]> => {
  switch (locale) {
    case "fr":
      return ctx.db
        .query("ingredients")
        .withSearchIndex("search_fr", (q) => q.search("search.fr", term))
        .take(limit);
    case "en":
      return ctx.db
        .query("ingredients")
        .withSearchIndex("search_en", (q) => q.search("search.en", term))
        .take(limit);
  }
};

/**
 * The ingredient catalog, searched in one locale. Matches a name or any of its aliases, with or
 * without accents — see `search` in `schema/ingredients.ts` for how that is indexed.
 *
 * An empty query returns nothing rather than the first twelve rows of the catalog: the caller is
 * a suggestion list under a text field, and a shopper who has typed nothing has asked nothing.
 */
export const searchCatalog = async (
  ctx: SearchCtx,
  { query, locale, limit = DEFAULT_LIMIT }: { query: string; locale: Locale; limit?: number },
): Promise<CatalogIngredient[]> => {
  const term = query.trim();
  if (!term) return [];

  const rows = await _matchingRows(ctx, term, locale, limit);

  return rows.map((row) => toCatalogIngredient(row, locale));
};
