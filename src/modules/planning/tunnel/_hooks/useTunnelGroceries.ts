import { useAtom, useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";

import { groceriesFor } from "../../_model/model";
import { draftMealsAtom, ownedRowsAtom } from "../../_hooks/atoms";

/**
 * The list the chosen meals imply: what is missing, and what the cellar already covers.
 *
 * Derived on every render rather than pinned when generation finished: while the review step can
 * still drop a meal, a stored list would go stale the moment it did.
 *
 * `owned` is a different claim from `covered` — the shopper saying "I have that anyway" over the
 * cellar's own answer — and only the missing rows can carry it, since the covered ones are not being
 * asked for in the first place.
 */
export const useTunnelGroceries = () => {
  const meals = useAtomValue(draftMealsAtom);
  const [owned, setOwned] = useAtom(ownedRowsAtom);

  const { missing, covered } = useMemo(() => groceriesFor(meals), [meals]);

  const newItemCount = useMemo(
    () => missing.reduce(
      (total, category) =>
        total + category.rows.filter((row) => !owned.includes(row.id)).length,
      0,
    ),
    [missing, owned],
  );

  const toggleHave = useCallback(
    (rowId: string) => setOwned((current) =>
      current.includes(rowId)
        ? current.filter((id) => id !== rowId)
        : [...current, rowId]),
    [setOwned],
  );

  return { missing, covered, meals, owned, newItemCount, toggleHave };
};
