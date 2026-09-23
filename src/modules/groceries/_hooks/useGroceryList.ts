import { useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";

import { buildSections, type StockRow } from "../_model/model";
import { groupToBuy } from "../_model/sort";
import { sortAtom } from "./atoms";
import { useSnapshot } from "./useSnapshot";
import { useStockActions } from "./useStockActions";

/**
 * What the grocery screen draws, and what a tap on a card does.
 *
 * Nothing is stored in this shape. "To buy" is the gap between what is wanted and what the cellar
 * holds, and "recently bought" is what is in neither — so one write changes one number and every
 * section re-reads itself.
 *
 * `toBuy` is that first section read the way the shopper asked — plain, per plate, or per aisle —
 * and it is what the grid draws for it. `sections` still carries the same rows unsplit, because
 * the cellar and "recently bought" are read from there, and the quantity sheet reasons about the
 * merged row, not a plate's share of it.
 *
 * `submit` exists for the rows that need no sheet: a card whose `onlyOption` is set has exactly
 * one amount it could move, and asking a question with one answer is worse than acting.
 */
export const useGroceryList = () => {
  const snapshot = useSnapshot();
  const sort = useAtomValue(sortAtom);
  const { apply, error } = useStockActions();

  const sections = useMemo(() => buildSections(snapshot), [snapshot]);
  const toBuy = useMemo(() => groupToBuy(sections["to-buy"], sort, snapshot), [sections, sort, snapshot]);

  const submit = useCallback(
    (row: StockRow, amount: number) =>
      apply(row.intent, { ingredientId: row.ingredientId, unit: row.unit }, amount),
    [apply],
  );

  return {
    sections,
    toBuy,
    submit,
    error,
    /**
     * Nothing wanted and nothing owned: the household has not started. Recently bought does not
     * count — a memory of past shops is not something to buy or cook with.
     *
     * Read off the raw rows rather than off `sections`, because `buildSections` drops a row it
     * cannot name yet: on the first load the names arrive after the rows, and a check on the drawn
     * sections would tell a shopper with a full list that it is empty for that round trip. False
     * while loading, for the same reason.
     */
    isEmpty: !snapshot.isLoading && snapshot.lines.length === 0 && snapshot.cellar.length === 0,
  };
};
