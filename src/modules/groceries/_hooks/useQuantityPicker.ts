import { useCallback, useMemo } from "react";

import { useTranslations, type TranslationKeys } from "translations";

import { quantityOptions, stockFor, type Intent, type StockRef } from "../_model/model";
import { useSnapshot } from "./useSnapshot";
import { useStockActions } from "./useStockActions";

const PROMPTS: Record<Intent, TranslationKeys<"Groceries">> = {
  buy: "Quantity.Prompts.buy",
  remove: "Quantity.Prompts.remove",
  relist: "Quantity.Prompts.relist",
};

/**
 * The quantity sheet, for whichever section was tapped.
 *
 * The options themselves come from `model.ts`, because the grid needs them too: a row the sheet
 * would offer a single tile for never opens the sheet at all. This hook is what is left once that
 * moved out — the wording, and where the answer goes.
 *
 * `needed` is what the tapped card showed, when it stood for less than the whole row — see
 * `quantityOptions`.
 */
export const useQuantityPicker = ({ ingredientId, unit, intent, needed }: StockRef & { intent: Intent; needed?: number }) => {
  const t = useTranslations("Groceries");
  const snapshot = useSnapshot();
  const { apply, error } = useStockActions();

  const ingredient = snapshot.ingredients.find(({ id }) => id === ingredientId) ?? null;

  const stock = useMemo(() => stockFor(snapshot, { ingredientId, unit }), [snapshot, ingredientId, unit]);

  const options = useMemo(() => quantityOptions(stock, unit, intent, needed), [stock, unit, intent, needed]);
  const owned = useMemo(() => stock?.owned ?? 0, [stock]);

  const submit = useCallback(
    (amount: number) => apply(intent, { ingredientId, unit }, amount),
    [apply, intent, ingredientId, unit],
  );

  return { ingredient, prompt: t(PROMPTS[intent]), owned, options, submit, error };
};
