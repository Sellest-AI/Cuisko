import { describe, expect, test } from "vitest";

import { EMPTY_PANTRY, add, buy, cook, missingFrom, type PantryRow } from "../pantry";

const carrots: PantryRow = { ingredient: "carrot", quantity: 500, unit: "g" };
const potatoes: PantryRow = { ingredient: "potato", quantity: 3, unit: "pcs" };

describe("add", () => {
  test("puts 500 g carrots on the to-buy list, not in the cellar", () => {
    expect(add(EMPTY_PANTRY, carrots)).toEqual({ toBuy: [carrots], cellar: [] });
  });

  test("sums a second 500 g of carrots into the same row", () => {
    expect(add(add(EMPTY_PANTRY, carrots), carrots).toBuy).toEqual([{ ...carrots, quantity: 1000 }]);
  });
});

describe("buy", () => {
  test("moves the carrots from the to-buy list into the cellar", () => {
    const pantry = buy(add(add(EMPTY_PANTRY, carrots), potatoes), "carrot");

    expect(pantry).toEqual({ toBuy: [potatoes], cellar: [carrots] });
  });

  test("sums into what the cellar already holds", () => {
    const pantry = buy(add({ toBuy: [], cellar: [potatoes] }, potatoes), "potato");

    expect(pantry.cellar).toEqual([{ ...potatoes, quantity: 6 }]);
  });

  test("does nothing for an ingredient not on the list", () => {
    const pantry = add(EMPTY_PANTRY, carrots);

    expect(buy(pantry, "onion")).toBe(pantry);
  });
});

describe("cook", () => {
  test("takes 3 potatoes out of a cellar holding 3, and the row goes", () => {
    const { pantry, deductions } = cook({ toBuy: [], cellar: [potatoes, carrots] }, [potatoes]);

    expect(pantry.cellar).toEqual([carrots]);
    expect(deductions).toEqual([{ ...potatoes, isGone: true }]);
  });

  test("leaves what a recipe did not need", () => {
    const { pantry, deductions } = cook({ toBuy: [], cellar: [carrots] }, [{ ...carrots, quantity: 300 }]);

    expect(pantry.cellar).toEqual([{ ...carrots, quantity: 200 }]);
    expect(deductions).toEqual([{ ...carrots, quantity: 300, isGone: false }]);
  });

  test("never goes below zero when the recipe needs more than the cellar holds", () => {
    const { pantry, deductions } = cook({ toBuy: [], cellar: [potatoes] }, [{ ...potatoes, quantity: 5 }]);

    expect(pantry.cellar).toEqual([]);
    expect(deductions).toEqual([{ ...potatoes, quantity: 3, isGone: true }]);
  });

  test("reports nothing for a line the cellar does not hold", () => {
    const cream: PantryRow = { ingredient: "cream", quantity: 20, unit: "cl" };

    expect(cook({ toBuy: [], cellar: [potatoes] }, [cream]).deductions).toEqual([]);
  });
});

describe("missingFrom", () => {
  test("lists only the shortfall of what the cellar holds in part", () => {
    const cream: PantryRow = { ingredient: "cream", quantity: 20, unit: "cl" };

    expect(missingFrom([{ ...potatoes, quantity: 2 }], [potatoes, cream])).toEqual([
      { ...potatoes, quantity: 1 },
      cream,
    ]);
  });
});
