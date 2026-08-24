import { useCallback, useMemo } from "react";

import { buildSections, type StockRow } from "../_model/model";
import { useSnapshot } from "./useSnapshot";
import { useStockActions } from "./useStockActions";

/**
 * What the grocery screen draws, and what a tap on a card does.
 *
 * Nothing is stored in this shape. "To buy" is the gap between what is wanted and what the cellar
 * holds, and "recently bought" is what is in neither — so one write changes one number and every
 * section re-reads itself.
 *
 * `submit` exists for the rows that need no sheet: a card whose `onlyOption` is set has exactly
 * one amount it could move, and asking a question with one answer is worse than acting.
 */
export const useGroceryList = () => {
  const snapshot = useSnapshot();
  const { apply, error } = useStockActions();

  const sections = useMemo(() => buildSections(snapshot), [snapshot]);

  const submit = useCallback(
    (row: StockRow, amount: number) =>
      apply(row.intent, { ingredientId: row.ingredientId, unit: row.unit }, amount),
    [apply],
  );

  return { sections, submit, error };
};
