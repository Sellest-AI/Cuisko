import type { WritableAtom } from "jotai";
import { atomWithReset, RESET } from "jotai/utils";

type Resettable = WritableAtom<unknown, [typeof RESET], void>;

/** Every atom declared with `householdAtom`, in the order they were declared. */
const _registry = new Set<Resettable>();

/**
 * An atom holding a fact about the household the app is shopping for, which goes back to `initial`
 * whenever that household changes.
 *
 * Use it in place of `atom(initial)` for session state that belongs to one kitchen: a purchase
 * that can still be undone, a word still being looked up, a planning run in progress. Read and
 * write it exactly like any other atom; the only difference is `HouseholdAtomsReset`. The rule, and
 * the check that holds every new atom to it (C14), are ADR 0016.
 *
 * Declared here rather than decided at each read, because the decision is about the value and not
 * about who reads it. A per-read opt-in (pass the household's store to every `useAtom`) is one
 * forgotten argument away from two readers of the same atom disagreeing, and nothing catches that.
 */
export const householdAtom = <T>(initial: T) => {
  const scoped = atomWithReset(initial);
  _registry.add(scoped as Resettable);
  return scoped;
};

/** How many times the household atoms have been reset: the session a write belongs to. */
let _session = 0;

/** Puts every household atom back to its initial value, in `store`. */
export const resetHouseholdAtoms = (store: { set: (target: Resettable, value: typeof RESET) => void }) => {
  _session++;
  for (const scoped of _registry) store.set(scoped, RESET);
};

/**
 * Captures the household session now; the returned check answers whether it is still the same one.
 *
 * For a write that waits on the server before touching a household atom. The reset runs the moment
 * the household changes, so a write computed from the old household's state and landing after it
 * would put that state straight back — into the atom the new household now reads:
 *
 *     const isSameHousehold = householdSession();
 *     await mutate(...);
 *     if (isSameHousehold()) setReceipts(next);
 */
export const householdSession = () => {
  const captured = _session;
  return () => captured === _session;
};
