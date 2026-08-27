import { useAtom, useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";

import { groceriesFor } from "../../_model/model";
import { draftMealsAtom, ownedRowsAtom } from "../../_hooks/atoms";

/**
 * The list the chosen meals imply, and which of its rows the kitchen already covers.
 *
 * Derived on every render rather than pinned when generation finished: while the review step can
 * still drop a meal, a stored list would go stale the moment it did. Once the meals come from a
 * real generation this is probably an artefact of it, not a function of the picks.
 */
export const useTunnelGroceries = () => {
  const meals = useAtomValue(draftMealsAtom);
  const [owned, setOwned] = useAtom(ownedRowsAtom);

  const categories = useMemo(() => groceriesFor(meals), [meals]);

  const newItemCount = useMemo(
    () => categories.reduce(
      (total, category) =>
        total + category.rows.filter((row) => !owned.includes(row.id)).length,
      0,
    ),
    [categories, owned],
  );

  const toggleHave = useCallback(
    (rowId: string) => setOwned((current) =>
      current.includes(rowId)
        ? current.filter((id) => id !== rowId)
        : [...current, rowId]),
    [setOwned],
  );

  return { categories, meals, owned, newItemCount, toggleHave };
};
