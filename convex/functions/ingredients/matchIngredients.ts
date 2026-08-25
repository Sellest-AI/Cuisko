import type { Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";
import { CONFIDENT, MARGIN, PLAUSIBLE, rankCandidates, searchTerms } from "@shared/ingredientMatch";

import { searchCatalog } from "./searchCatalog";

type MatchCtx = Pick<QueryCtx, "db">;

/**
 * What one free-text ingredient name resolved to.
 *
 * Three cases rather than an id and a confidence number, because the caller has to *do* something
 * different in each: link it, ask the cook, or offer to create the row. A `{ id, score }` pair
 * pushes that decision to every call site, and the second call site is where the threshold gets
 * compared with `>` instead of `>=`.
 */
export type MatchedIngredient =
  | { status: "matched"; name: string; ingredientId: Id<"ingredients"> }
  | {
      status: "ambiguous";
      name: string;
      candidates: { ingredientId: Id<"ingredients">; score: number }[];
    }
  | { status: "unmatched"; name: string };

/**
 * How many rows the search index is asked for before ranking.
 *
 * Wider than the suggestion list `searchCatalog` defaults to: the index orders by its own
 * relevance, which is exactly the ordering this file exists not to trust, so the right row can sit
 * at position 9 of 12. Ranking is pure and cheap; missing the row entirely is not recoverable.
 */
const SEARCH_LIMIT = 24;

/** What a cook is shown when nothing was confident — more is a wall, fewer hides the right one. */
const MAX_CANDIDATES = 3;

const _match = async (
  ctx: MatchCtx,
  name: string,
  locale: Locale,
): Promise<MatchedIngredient> => {
  // The index is asked for the identifying words, the ranker scores against what the cook wrote:
  // a row the search never returned cannot be ranked, however well it would have scored.
  const rows = await searchCatalog(ctx, {
    query: searchTerms(name),
    locale,
    limit: SEARCH_LIMIT,
  });

  const ranked = rankCandidates(
    name,
    rows.map((row) => ({ id: row._id, name: row.name, aliases: row.aliases })),
  );

  const best = ranked[0];
  if (!best || best.score < PLAUSIBLE) return { status: "unmatched", name };

  const runnerUp = ranked[1]?.score ?? 0;
  if (best.score >= CONFIDENT && best.score - runnerUp >= MARGIN)
    return { status: "matched", name, ingredientId: best.id as Id<"ingredients"> };

  return {
    status: "ambiguous",
    name,
    candidates: ranked
      .filter(({ score }) => score >= PLAUSIBLE)
      .slice(0, MAX_CANDIDATES)
      .map(({ id, score }) => ({ ingredientId: id as Id<"ingredients">, score })),
  };
};

/**
 * Free-text ingredient names to catalog rows — the half of sanitizing a recipe that is an
 * algorithm rather than a generation.
 *
 * The sanitize tool returns *names*, because a model asked to return database ids invents them.
 * Turning a name into a row is a search and a ranking, both of which can be tested against the
 * real catalog with no model in the loop, so they live here and not in the prompt.
 *
 * Names are resolved independently and in parallel: they come from one recipe, but nothing about
 * "flour" changes what "butter" should match, and a recipe of a dozen lines run in sequence is a
 * dozen round trips of latency for no gain.
 */
export const matchIngredients = async (
  ctx: MatchCtx,
  { names, locale }: { names: string[]; locale: Locale },
): Promise<MatchedIngredient[]> =>
  Promise.all(names.map((name) => _match(ctx, name, locale)));
