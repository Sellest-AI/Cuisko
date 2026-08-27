import { useCallback } from "react";

import { useDebounce } from "~/hooks/useDebounce";
import { useLocale } from "~/hooks/useLocale";
import { api } from "~/lib/convex/api";
import { usePaginatedQueryCached, useQueryHeld } from "~/lib/convex/client";

/**
 * How many recipes a page carries.
 *
 * Sized to the grid rather than to the network: the list is two columns, so this is twelve rows —
 * several screenfuls, which is what makes the scroll that fetches the next page feel like scrolling
 * rather than like a button.
 */
const PAGE_SIZE = 24;

/** Below this the box has narrowed nothing: one letter cannot usefully cut a cook's own list. */
const MIN_SEARCH_LENGTH = 2;

/**
 * The recipes under the box: the cook's own list, or what a term narrows it to.
 *
 * **One hook and one shape, because the screen draws one grid.** Which of the two queries answers
 * is this hook's business — a screen that had to know would have to branch on it, and the two
 * branches would drift into two different grids.
 *
 * The list never sorts and never slices. Ordering is the index's (`by_user`, descending), and it is
 * load-bearing rather than cosmetic: a cook arrives here straight from the editor, and the recipe
 * they just wrote is the one they came to see. `usePaginatedQueryCached` rather than the plain one
 * so the pages already fetched survive a tab switch.
 *
 * Both queries stay subscribed. Skipping the list while a search runs would mean re-fetching page
 * one every time the box is cleared, and clearing the box is the most common thing that happens to
 * it — so the list is kept warm and the matches are drawn over it instead.
 *
 * Two separate things stop the grid flickering, and each needs its own fix. Debouncing stops a
 * query per keystroke; it does not stop the grid emptying when the settled term finally changes,
 * because the cache is keyed on the arguments and has no entry for the new ones yet. `useQueryHeld`
 * is what keeps the previous matches on screen until the better ones arrive, and `isStale` is how a
 * caller can still tell which of the two it is looking at.
 */
export const useRecipeList = (query: string) => {
  const locale = useLocale();
  const settled = useDebounce(query).trim();
  const isSearching = settled.length >= MIN_SEARCH_LENGTH;

  const list = usePaginatedQueryCached(
    api.router.recipes.getAll.authed,
    { locale },
    { initialNumItems: PAGE_SIZE },
  );

  const found = useQueryHeld(
    api.router.recipes.search.authed,
    isSearching ? { query: settled, locale } : "skip",
  );

  /**
   * Stable, because the grid hands it to `onEndReached` — a new function every render would make
   * the prop change on every render, which is the shape that turns one scroll into a fetch loop.
   */
  const { loadMore } = list;
  const fetchMore = useCallback(() => loadMore(PAGE_SIZE), [loadMore]);

  return {
    recipes: isSearching ? (found.data ?? []) : list.results,
    /**
     * Whether a term is narrowing the grid — which is not the same as the box holding text, since
     * a single letter narrows nothing and the term is debounced besides.
     *
     * The screen needs it for one reason: an empty grid means opposite things in the two cases. No
     * recipes at all is the start of something; no matches is a dead end, and offering to write a
     * first recipe to a cook who has twenty would read as the app having lost them.
     */
    isSearching,
    /**
     * The first answer only. A later page arriving underneath a grid that is already drawn is not
     * the screen loading, and reporting it as such would blank content the cook is reading.
     */
    isLoading: isSearching ? found.data === undefined : list.status === "LoadingFirstPage",
    /** True only while a previous set of matches stands in for one still in flight. */
    isStale: isSearching && found.isStale,
    /**
     * Always false while searching. A search answers with its best matches rather than with a page,
     * so there is no next cursor — and scrolling past the last match must not quietly start
     * appending the unfiltered list underneath it.
     */
    hasMore: !isSearching && list.status === "CanLoadMore",
    loadMore: fetchMore,
  };
};
