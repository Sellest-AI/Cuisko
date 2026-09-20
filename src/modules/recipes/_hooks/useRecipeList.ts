import { useCallback } from "react";

import { useLocale } from "~/hooks/useLocale";
import { api } from "~/lib/convex/api";
import { usePaginatedQueryCached } from "~/lib/convex/client";

import { useRecipeMatches } from "./useRecipeMatches";

/**
 * How many recipes a page carries.
 *
 * Sized to the grid rather than to the network: the list is two columns, so this is twelve rows —
 * several screenfuls, which is what makes the scroll that fetches the next page feel like scrolling
 * rather than like a button.
 */
const PAGE_SIZE = 24;

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
 * The debouncing, the minimum term length and the holding that stop the grid flickering all belong
 * to `useRecipeMatches` now — this hook only chooses which of the two answers the grid draws.
 */
export const useRecipeList = (query: string) => {
  const locale = useLocale();

  const list = usePaginatedQueryCached(
    api.router.recipes.getAll.authed,
    { locale },
    { initialNumItems: PAGE_SIZE },
  );

  /**
   * The matching half is `useRecipeMatches` and not a second copy of it here, because the
   * navigation bar now asks the very same question. Two debounces against one query would be two
   * places for the settled term, the minimum length and the holding to drift apart — and the two
   * surfaces would then rank the same search differently, which is what this module already
   * refuses to let happen between its own two screens.
   */
  const matches = useRecipeMatches(query);
  const { isSearching } = matches;

  /**
   * Stable, because the grid hands it to `onEndReached` — a new function every render would make
   * the prop change on every render, which is the shape that turns one scroll into a fetch loop.
   */
  const { loadMore } = list;
  const fetchMore = useCallback(() => loadMore(PAGE_SIZE), [loadMore]);

  return {
    recipes: isSearching ? matches.recipes : list.results,
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
    isLoading: isSearching ? matches.isLoading : list.status === "LoadingFirstPage",
    /** True only while a previous set of matches stands in for one still in flight. */
    isStale: matches.isStale,
    /**
     * Always false while searching. A search answers with its best matches rather than with a page,
     * so there is no next cursor — and scrolling past the last match must not quietly start
     * appending the unfiltered list underneath it.
     */
    hasMore: !isSearching && list.status === "CanLoadMore",
    loadMore: fetchMore,
  };
};
