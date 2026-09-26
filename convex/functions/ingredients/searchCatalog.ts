import type { Doc } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";
import { rankCandidates } from "@shared/ingredientMatch";

import { type CatalogIngredient, loadCatalogIngredients, toCatalogIngredient } from "./catalogIngredient";

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
 * How many rows the index is asked for before ranking keeps `limit` of them — the same width
 * `searchWidened` asks for, and for the same reason: the right row can sit low in the index's order.
 */
const CANDIDATES = 24;

/**
 * The index's rows, best match first by `rankCandidates` — the ranker the resolver links with.
 *
 * **Not the index's own order, because that order cannot tell the food from its variants.** It
 * scores the words a row shares with the query, so "milk" ties every two-word milk and returns
 * whichever it holds first — oat, almond, coconut — and a caller keeping three rows never sees a
 * dairy milk. The ranker reads the aliases ("milk" is one of the plain milk's) and punishes the
 * words a row carries that nobody asked for.
 *
 * Rows the ranker scores 0 are kept, after the rest and in the index's order, rather than dropped:
 * the navigation bar searches while the shopper is still typing, and a half-typed word the index
 * prefix-matched is still a row to show.
 */
const _ranked = (
  term: string,
  rows: Doc<"ingredients">[],
  locale: Locale,
): Doc<"ingredients">[] => {
  const scores = new Map(
    rankCandidates(
      term,
      rows.map((row, index) => {
        const { name, aliases } = toCatalogIngredient(row, locale);
        return { id: String(index), name, aliases };
      }),
    ).map(({ id, score }) => [Number(id), score]),
  );

  // `sort` is stable, so equal scores — and every unscored row — keep the index's order.
  return rows
    .map((row, index) => ({ row, score: scores.get(index) ?? 0 }))
    .sort((left, right) => right.score - left.score)
    .map(({ row }) => row);
};

/**
 * The ingredient catalog, searched in one locale. Matches a name or any of its aliases, with or
 * without accents — see `search` in `schema/ingredients.ts` for how that is indexed — and ranked
 * by `_ranked` before it is cut to `limit`.
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

  const rows = await _matchingRows(ctx, term, locale, Math.max(limit, CANDIDATES));

  // Images are read for the rows kept, not for every candidate the ranking looked at.
  return loadCatalogIngredients(ctx, _ranked(term, rows, locale).slice(0, limit), locale);
};
