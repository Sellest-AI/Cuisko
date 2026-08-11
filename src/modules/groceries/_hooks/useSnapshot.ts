import { useAtomValue } from "jotai";
import { useMemo } from "react";

import { cellarAtom, historyAtom, ingredientsAtom, linesAtom, receiptsAtom } from "./atoms";
import type { Snapshot } from "../_model/model";
import { useLiveWindow } from "./useLiveWindow";

/**
 * Everything the pure functions in `model.ts` read, as one value — the four sets plus the clock
 * the undo window is measured against.
 *
 * The sets are shared; the clock is not. Each caller keeps its own, and each wakes itself at the
 * next expiry, so the grid and the quantity modal stay correct independently rather than in step.
 * Nothing here depends on them agreeing to the millisecond — a receipt seconds from expiry is
 * still a receipt, whichever screen is asking.
 */
export const useSnapshot = (): Snapshot => {
  const ingredients = useAtomValue(ingredientsAtom);
  const lines = useAtomValue(linesAtom);
  const cellar = useAtomValue(cellarAtom);
  const receipts = useAtomValue(receiptsAtom);
  const history = useAtomValue(historyAtom);

  const now = useLiveWindow(receipts);

  return useMemo(
    () => ({ ingredients, lines, cellar, receipts, history, now }),
    [ingredients, lines, cellar, receipts, history, now],
  );
};
