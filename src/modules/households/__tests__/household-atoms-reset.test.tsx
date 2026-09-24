import { render } from "@testing-library/react";
import { atom, createStore, Provider } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { householdAtom } from "../household-atom";
import { HouseholdAtomsReset } from "../household-atoms-reset";

/** Which household the app is shopping for; a test switches it by writing here and re-rendering. */
const household = vi.hoisted(() => ({ id: "household-a" as string | undefined }));

vi.mock("../_hooks/useHousehold", () => ({
  useHousehold: () => ({ householdId: household.id, isLoading: false }),
}));

/** A purchase that can still be undone: household state. */
const receiptsAtom = householdAtom<string[]>([]);

/** How the list is sorted: a way of looking, not a fact about the kitchen. */
const sortAtom = atom("standard");

describe("HouseholdAtomsReset", () => {
  let store: ReturnType<typeof createStore>;

  const mount = () => {
    const view = render(<Provider store={store}><HouseholdAtomsReset /></Provider>);
    return () => view.rerender(<Provider store={store}><HouseholdAtomsReset /></Provider>);
  };

  beforeEach(() => {
    household.id = "household-a";
    store = createStore();
  });

  /** The bug this exists for: A's receipt was peeled against B's cellar after a switch. */
  it("empties household state when the household changes, and leaves plain atoms alone", () => {
    const rerender = mount();
    store.set(receiptsAtom, ["onion bought in A"]);
    store.set(sortAtom, "aisle");

    household.id = "household-b";
    rerender();

    expect(store.get(receiptsAtom)).toEqual([]);
    expect(store.get(sortAtom)).toBe("aisle");
  });

  /** `getMine` is skipped or reloading for a moment on an auth refresh; that is not a switch. */
  it("keeps household state while the household is briefly unknown", () => {
    const rerender = mount();
    store.set(receiptsAtom, ["onion bought in A"]);

    household.id = undefined;
    rerender();
    household.id = "household-a";
    rerender();

    expect(store.get(receiptsAtom)).toEqual(["onion bought in A"]);
  });

  /** Sign-out, then another account: the next household is not the last known one. */
  it("empties household state when an unknown gap ends on a different household", () => {
    const rerender = mount();
    store.set(receiptsAtom, ["onion bought in A"]);

    household.id = undefined;
    rerender();
    household.id = "household-b";
    rerender();

    expect(store.get(receiptsAtom)).toEqual([]);
  });

  it("keeps what was set before the first household was known", () => {
    household.id = undefined;
    const rerender = mount();
    store.set(receiptsAtom, ["typed while loading"]);

    household.id = "household-a";
    rerender();

    expect(store.get(receiptsAtom)).toEqual(["typed while loading"]);
  });
});
