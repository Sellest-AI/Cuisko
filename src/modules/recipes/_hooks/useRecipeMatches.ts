import { useDebounce } from "~/hooks/useDebounce";
import { useLocale } from "~/hooks/useLocale";
import { api } from "~/lib/convex/api";
import { useQueryHeld } from "~/lib/convex/client";

/** Below this the box has narrowed nothing: one letter cannot usefully cut a cook's own list. */
const MIN_SEARCH_LENGTH = 2;

/**
 * What a term matches, and nothing else — no list underneath it, no pagination.
 *
 * **Two callers, and they want the answer for different reasons.** The recipes screen draws these
 * over its own grid; the navigation bar asks whether a dish by this name exists at all, and throws
 * away everything whose title the input does not cover. Both need the same matches ranked the same
 * way, which is the entire reason this is one hook rather than a copy in each.
 *
 * **It returns what the search returned, unfiltered.** The title narrowing the bar applies is the
 * bar's rule, and it lives beside the coverage rule it shares its thresholds with
 * (`coversTitle`) — putting half of that gate here would split one decision across two modules and
 * let the halves drift.
 *
 * Two separate things stop the result flickering, and each needs its own fix. Debouncing stops a
 * query per keystroke; it does not stop the answer emptying when the settled term finally changes,
 * because the cache is keyed on the arguments and has no entry for the new ones yet. `useQueryHeld`
 * keeps the previous matches until the better ones arrive, and `isStale` is how a caller tells
 * which of the two it is holding.
 */
export const useRecipeMatches = (query: string) => {
  const locale = useLocale();
  const settled = useDebounce(query).trim();

  /**
   * Whether a term is narrowing anything — not the same as the box holding text, since a single
   * letter narrows nothing and the term is debounced besides.
   */
  const isSearching = settled.length >= MIN_SEARCH_LENGTH;

  const found = useQueryHeld(
    api.router.recipes.search.authed,
    isSearching ? { query: settled, locale } : "skip",
  );

  return {
    recipes: found.data ?? [],
    /**
     * The term these matches are actually for, which is not what the box holds while the debounce
     * is still running. A caller that narrows the result further has to narrow it against this one
     * — filtering the answer to "boeuf" by the live "boeuf bourg" drops every card for a word the
     * server was never asked about.
     */
    term: settled,
    isSearching,
    /**
     * The first answer only. A later one arriving underneath something already drawn is not the
     * screen loading, and reporting it as such would blank content the cook is reading.
     */
    isLoading: isSearching && found.data === undefined,
    /** True only while a previous set of matches stands in for one still in flight. */
    isStale: isSearching && found.isStale,
  };
};
