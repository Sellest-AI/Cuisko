import { useMemo } from "react";

import { buildSections } from "../_model/model";
import { useSnapshot } from "./useSnapshot";

/**
 * How many rows the list and the cellar hold, for a screen that names them without drawing them.
 *
 * Counted off the same `buildSections` the grocery screen draws from, and not off the raw tables:
 * the number Home prints has to be the number of cards the shopper lands on, and once a line can
 * carry a plate's claim (see `useSnapshot`), "to buy" stops being the table's length. One producer
 * for the number, so the two never drift.
 *
 * `isLoading` travels with them because the derivation drops a row it cannot name yet: until the
 * catalog answers, both counts read zero, and a screen that printed that would be claiming an
 * empty list it has not seen.
 */
export const useStockCounts = () => {
  const snapshot = useSnapshot();
  const sections = useMemo(() => buildSections(snapshot), [snapshot]);

  /** Rows on the table, none named yet: the first catalog answer is still in flight. */
  const isNaming = snapshot.ingredients.length === 0 && (snapshot.lines.length > 0 || snapshot.cellar.length > 0);

  return {
    toBuy: sections["to-buy"].length,
    inStock: sections.cellar.length,
    isLoading: snapshot.isLoading || isNaming,
  };
};
