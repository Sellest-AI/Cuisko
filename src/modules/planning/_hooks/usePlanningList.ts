import { useAtomValue } from "jotai";
import { useMemo } from "react";

import { addDays, buildRows, indexOfDate, parseDateParam, planSections } from "../_model/model";
import { planMealsAtom } from "./atoms";
import { PLACEHOLDER_DAYS_AHEAD } from "./placeholders";

/**
 * The week as a list, and the row it should open on.
 *
 * Reads the plan rather than deriving it, which is what lets the swap sheet change what this list
 * shows: the sheet is a route of its own, so a plan rebuilt here per mount would have nothing for
 * it to write back to and the two would drift apart on the first edit.
 *
 * Takes the focus day as the raw route string and validates it here rather than at the route: the
 * hook owns what the screen reads, and parsing in `app/**` would put a derivation in the one layer
 * that has no tests (ADR 0006).
 *
 * The plan is seeded from `placeholders.ts`; the shape returned here is the contract a later slice
 * swaps a Convex query into without the screen changing.
 */
export const usePlanningList = (focusDate?: string) => {
  const meals = useAtomValue(planMealsAtom);

  /**
   * One "today" per mount. Rebuilding it every render would rebuild every `Date` with it, and the
   * list's identity would change under the scroll position on any unrelated state change.
   */
  const today = useMemo(() => new Date(), []);

  /**
   * The days the list offers an empty plate on. Only forward: `planSections` keeps a day of its
   * own for any meal dated outside this range, so what was already cooked still shows — while a
   * past day the user never filled stays out, because drawing the gaps behind them turns a week
   * they lived into a week they failed.
   */
  const dates = useMemo(
    () => Array.from({ length: PLACEHOLDER_DAYS_AHEAD + 1 }, (_, index) => addDays(today, index)),
    [today],
  );

  const rows = useMemo(
    () => buildRows(planSections(dates, meals, today), today),
    [dates, meals, today],
  );

  const initialIndex = useMemo(
    () => indexOfDate(rows, parseDateParam(focusDate)),
    [rows, focusDate],
  );

  return { rows, initialIndex, today };
};
