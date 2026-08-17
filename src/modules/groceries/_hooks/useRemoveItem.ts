import { useCallback } from "react";

import { type StockRef } from "../_model/model";
import { useStockActions } from "./useStockActions";

/**
 * Striking an ingredient off the list, for the sheet's delete action.
 *
 * A file of its own rather than a second export inside `useQuantityPicker`: it shares that hook's
 * ref and nothing else — no snapshot, no options, no prompt — and the folder is the binding site,
 * so it takes as many hook files as the domain needs.
 *
 * The ref it is given is the *row's*, never the unit the shopper is typing in. Both arrive at the
 * sheet and they are not the same thing; see `quantity-screen.tsx`.
 */
export const useRemoveItem = ({ ingredientId, unit }: StockRef) => {
  const { forceRemove } = useStockActions();

  const remove = useCallback(
    () => forceRemove({ ingredientId, unit }),
    [forceRemove, ingredientId, unit],
  );

  return { remove };
};
