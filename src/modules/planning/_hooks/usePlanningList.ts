import { useCallback, useMemo, useState } from "react";

import { useLocale } from "~/hooks/useLocale";
import { api } from "~/lib/convex/api";
import { usePaginatedQueryCached } from "~/lib/convex/client";
import { useHousehold } from "~/modules/households/hooks";

import {
  buildRows,
  indexOfDate,
  keptMealCardOf,
  openDates,
  parseDateParam,
  planSections,
  startOfDay,
} from "../_model/model";

/**
 * Plates per page, each way. Two weeks of lunches and dinners: several screenfuls, so the fetch that
 * a scroll triggers lands before the scroll reaches the end of what is drawn.
 */
const PAGE_SIZE = 28;

/**
 * The kept week as a list, open on a day, scrollable back through what was cooked and on into what is
 * planned.
 *
 * **Two paginated queries that meet at the focus day.** A Convex cursor resumes a read and cannot seek
 * to a value, so the day goes into the index range: `after` walks forward from it, `before` walks back
 * and is reversed on arrival to sit above. Scrolling down loads newer, up loads older.
 *
 * **The day is fixed per mount.** Changing a paginated query's arguments throws away every page it
 * holds, so `from` is derived from the route string once and not from anything that re-renders.
 *
 * Takes the focus day as the raw route string and validates it here rather than at the route: the
 * hook owns what the screen reads, and parsing in `app/**` would put a derivation in the one layer
 * that has no tests (ADR 0006).
 */
export const usePlanningList = (focusDate?: string) => {
  const locale = useLocale();
  const { householdId, isLoading: isResolvingHousehold } = useHousehold();

  /**
   * One "today" per mount. Rebuilding it every render would rebuild every `Date` with it, and the
   * list's identity would change under the scroll position on any unrelated state change.
   */
  const [today] = useState(() => startOfDay(new Date()));

  const focus = useMemo(() => parseDateParam(focusDate) ?? today, [focusDate, today]);
  const from = focus.getTime();

  const before = usePaginatedQueryCached(
    api.router.planning.getPaginated.authed,
    householdId ? { householdId, locale, from, direction: "before" } : "skip",
    { initialNumItems: PAGE_SIZE },
  );

  const after = usePaginatedQueryCached(
    api.router.planning.getPaginated.authed,
    householdId ? { householdId, locale, from, direction: "after" } : "skip",
    { initialNumItems: PAGE_SIZE },
  );

  const meals = useMemo(
    () => [...before.results].reverse().concat(after.results).map(keptMealCardOf),
    [before.results, after.results],
  );

  /** Empty plates from today through the last planned day — never behind the user, never past the plan. */
  const rows = useMemo(
    () => buildRows(planSections(openDates(today, meals), meals, today), today),
    [meals, today],
  );

  const initialIndex = useMemo(() => indexOfDate(rows, focus), [rows, focus]);

  /**
   * Stable, because the list hands them to `onStartReached` / `onEndReached` — a new function every
   * render is the shape that turns one scroll into a fetch loop.
   */
  const { loadMore: loadMoreBefore } = before;
  const { loadMore: loadMoreAfter } = after;
  const loadOlder = useCallback(() => loadMoreBefore(PAGE_SIZE), [loadMoreBefore]);
  const loadNewer = useCallback(() => loadMoreAfter(PAGE_SIZE), [loadMoreAfter]);

  return {
    rows,
    initialIndex,
    today,
    /**
     * Until both first pages are in. The list opens on `initialIndex`, which FlashList reads once on
     * its first render — drawn early, it would open on the rows of one half and scroll to the wrong day.
     *
     * Scoped on `householdId` rather than on the statuses alone, because a skipped query reports
     * itself as loading, and a user with no household would otherwise wait forever.
     */
    isLoading: isResolvingHousehold ||
      (!!householdId && (before.status === "LoadingFirstPage" || after.status === "LoadingFirstPage")),
    loadOlder,
    loadNewer,
  };
};
