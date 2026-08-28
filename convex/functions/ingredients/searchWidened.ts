import type { Id } from "@convex/_generated/dataModel";
import { LOCALES, type Locale } from "@convex/schema/i18n";
import type { QueryCtx } from "@convex/procedures";
import type { Unit } from "@shared/ingredients";
import { rankCandidates, RESOLVABLE, searchTerms } from "@shared/ingredientMatch";

import { loadIngredients } from "./loadIngredients";
import { searchCatalog } from "./searchCatalog";

type SearchCtx = Pick<QueryCtx, "db">;

/**
 * Wider than `matchIngredients` asks for, for the same reason: the ranker exists not to trust the
 * index's own ordering, and the right row can sit low in a page that two locales contribute to.
 */
const SEARCH_LIMIT = 24;

/** More than a shopper would read, but this list is read by the resolver, not by a person. */
const MAX_CANDIDATES = 5;

export type WidenedCandidate = {
  ingredientId: Id<"ingredients">;
  name: string;
  score: number;
  /**
   * How this food is bought, carried alongside the name because the caller needs it the moment it
   * links: a shopper who typed no unit gets the row's own, and the alternative is a second read of
   * a row this function already loaded. Nobody buys one gnocchi.
   */
  defaultUnit: Unit;
  defaultQuantity: number;
};

/**
 * "Before we invent a row, is this already here — under another spelling, or another language?"
 *
 * **Not a duplicate of `matchIngredients`, and the difference is the point.** That one answers
 * which catalog row a recipe line means, and is deliberately strict because a wrong link silently
 * corrupts a recipe's nutrition total and its grocery line. This one answers whether a row exists
 * at all, where the failure is reversed: a miss here creates a second `carotte` that splits every
 * grocery list and every nutrition total from then on, with no error anywhere. So it widens on
 * both axes that one narrows.
 *
 * **Both locale indexes, not the caller's.** A search index is per-locale — `search_fr` holds the
 * French names, `search_en` the English ones — so a shopper typing "carrot" on a French device
 * queries `search_fr`, finds nothing, and the row sits in `search_en` where nobody looked. That is
 * problem 2 of this slice, and it is fixed here.
 *
 * **Down to `RESOLVABLE` rather than `PLAUSIBLE`** — see that constant for why the threshold is
 * lower here than anywhere else, and why it is still above the catalog's measured noise floor.
 *
 * Ranked best first. Whether the top score is good enough to link without asking is not decided
 * here: this returns evidence, and `resolveIngredient` weighs it against what the datasets say.
 */
export const searchWidened = async (
  ctx: SearchCtx,
  { text, locale }: { text: string; locale: Locale },
): Promise<WidenedCandidate[]> => {
  const query = searchTerms(text);
  if (!query) return [];

  // Both indexes in parallel: they are independent reads and a shopper is waiting on a placeholder
  // card. A row found in both comes back twice, which the scoring below turns into an advantage.
  const pages = await Promise.all(
    LOCALES.map(async (indexed) => ({
      indexed,
      rows: await searchCatalog(ctx, { query, locale: indexed, limit: SEARCH_LIMIT }),
    })),
  );

  /**
   * A row scores once per language it was found in, and keeps its best.
   *
   * `searchCatalog` resolves a row's name and synonyms into the locale it searched, so the two
   * pages are two views of the same catalog: the English view scores "carrot" and the French one
   * scores "carotte". Taking the maximum is what makes this function language-blind without the
   * ranker having to be — a row wins on whichever of its languages the shopper actually typed.
   */
  const best = new Map<Id<"ingredients">, number>();

  for (const { rows } of pages) {
    const ranked = rankCandidates(
      text,
      rows.map((row) => ({ id: row._id, name: row.name, aliases: row.aliases })),
    );

    for (const { id, score } of ranked) {
      const ingredientId = id as Id<"ingredients">;
      if (score > (best.get(ingredientId) ?? 0)) best.set(ingredientId, score);
    }
  }

  const winners = [...best]
    .filter(([, score]) => score >= RESOLVABLE)
    .sort(([, left], [, right]) => right - left)
    .slice(0, MAX_CANDIDATES);

  /**
   * Named by a read rather than off the page that found it, and the difference is not cosmetic.
   * The case this function exists for is a row the caller's OWN index never returned — "carrot"
   * on a French device — and that page therefore has no French name in it to reuse. Reading the
   * winners resolves each into the caller's locale whichever index found it.
   *
   * Cheap because it runs on the survivors: at most `MAX_CANDIDATES` documents, after the filter.
   */
  const named = await loadIngredients(ctx, { ids: winners.map(([id]) => id), locale });
  const rows = new Map(named.map((row) => [row._id, row]));

  return winners.flatMap(([ingredientId, score]) => {
    const row = rows.get(ingredientId);

    // A row deleted between the search and this read is dropped rather than returned unnamed —
    // the same trade `loadIngredients` makes, for the same reason.
    return row
      ? [{
        ingredientId,
        name: row.name,
        score,
        defaultUnit: row.defaultUnit,
        defaultQuantity: row.defaultQuantity,
      }]
      : [];
  });
};
