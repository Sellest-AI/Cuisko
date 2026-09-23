import { useStore } from "jotai";
import { useLayoutEffect, useRef } from "react";

import { useHousehold } from "./_hooks/useHousehold";
import { resetHouseholdAtoms } from "./household-atom";

/**
 * Empties every `householdAtom` when the household the app shops for changes.
 *
 * Mounted once, at the root, because a switch can happen from the home header, the grocery list or
 * the account drawer — and none of the screens that own the atoms has to be on screen for their
 * state to be wrong the next time it is.
 *
 * It compares known households only. `householdId` is also `undefined` for a moment whenever
 * `getMine` is skipped or reloading — an auth refresh, say — and resetting on that would empty a
 * planning run halfway through for no switch at all. So an unknown id is ignored, and the next
 * known one is compared with the last known one. Sign-out is still covered: the next account's
 * household is not the one this device last held, so its first appearance resets.
 *
 * It does not reset on the first household arriving: nothing was held for a household before one
 * was known. A layout effect, so the new household is never painted with the old one's state.
 */
export const HouseholdAtomsReset = () => {
  const { householdId } = useHousehold();
  const store = useStore();
  const lastKnown = useRef(householdId);

  useLayoutEffect(() => {
    if (householdId === undefined) return;
    if (lastKnown.current !== undefined && lastKnown.current !== householdId) resetHouseholdAtoms(store);
    lastKnown.current = householdId;
  }, [householdId, store]);

  return null;
};
