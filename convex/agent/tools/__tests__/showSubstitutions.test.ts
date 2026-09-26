import { describe, expect, it } from "vitest";

import { toSubstitutionsCard } from "../showSubstitutions";

/**
 * The rules the card is stored under. Which ids count as missing (malformed, another table's,
 * deleted) is `missingIngredientIds`'s question and is pinned in its own test.
 */
describe("toSubstitutionsCard", () => {
  it("keeps the swaps in the order the cook asked", () => {
    expect(
      toSubstitutionsCard([{ from: "carrot", to: "tomato" }, { from: "water", to: "milk" }], []),
    ).toEqual({ v: 1, swaps: [{ from: "carrot", to: "tomato" }, { from: "water", to: "milk" }] });
  });

  it("drops a repeated swap, keeping its first position", () => {
    expect(
      toSubstitutionsCard([{ from: "a", to: "b" }, { from: "c", to: "d" }, { from: "a", to: "b" }], []).swaps,
    ).toEqual([{ from: "a", to: "b" }, { from: "c", to: "d" }]);
  });

  it("throws on an unknown id, naming it, instead of showing the other rows", () => {
    expect(() => toSubstitutionsCard([{ from: "a", to: "ghost" }], ["ghost"])).toThrow(/ghost/);
  });

  it("throws on an ingredient swapped for itself", () => {
    expect(() => toSubstitutionsCard([{ from: "a", to: "a" }], [])).toThrow(/itself/);
  });
});
