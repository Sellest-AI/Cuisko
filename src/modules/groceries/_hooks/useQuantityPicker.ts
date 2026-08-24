import { useCallback, useMemo } from "react";

import { quantityOptions, stockFor, type Intent, type StockRef } from "../_model/model";
import { useSnapshot } from "./useSnapshot";
import { useStockActions } from "./useStockActions";

const PROMPTS: Record<Intent, string> = {
  buy: "How much did you add?",
  remove: "How much did you take out?",
  relist: "How much do you need?",
};

/**
 * The quantity sheet, for whichever section was tapped.
 *
 * The options themselves come from `model.ts`, because the grid needs them too: a row the sheet
 * would offer a single tile for never opens the sheet at all. This hook is what is left once that
 * moved out — the wording, and where the answer goes.
 */
export const useQuantityPicker = ({ ingredientId, unit, intent }: StockRef & { intent: Intent }) => {
  const snapshot = useSnapshot();
  const { apply, error } = useStockActions();

  const ingredient = snapshot.ingredients.find(({ id }) => id === ingredientId) ?? null;

  const stock = useMemo(() => stockFor(snapshot, { ingredientId, unit }), [snapshot, ingredientId, unit]);

  const options = useMemo(() => quantityOptions(stock, unit, intent), [stock, unit, intent]);
  const owned = useMemo(() => stock?.owned ?? 0, [stock]);

  const submit = useCallback(
    (amount: number) => apply(intent, { ingredientId, unit }, amount),
    [apply, intent, ingredientId, unit],
  );

  return { ingredient, prompt: PROMPTS[intent], owned, options, submit, error };
};
