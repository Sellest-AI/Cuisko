import { describe, expect, test } from "vitest";

import { formatQuantity, pickQuantity, toGrams, serializeIngredients } from "../ingredients";

describe("toGrams", () => {
  test("converts a mass unit without knowing anything about the ingredient", () => {
    expect(toGrams(500, "g", {})).toBe(500);
    expect(toGrams(1.5, "kg", {})).toBe(1500);
    expect(toGrams(200, "mg", {})).toBeCloseTo(0.2);
    expect(toGrams(1, "lb", {})).toBeCloseTo(453.59, 2);
  });

  test("converts a volume through the ingredient's density", () => {
    // A tablespoon of olive oil: 15ml at 0.91 g/ml.
    expect(toGrams(1, "cs", { gramsPerMl: 0.91 })).toBeCloseTo(13.65);
    expect(toGrams(1, "cc", { gramsPerMl: 0.91 })).toBeCloseTo(4.55);
    expect(toGrams(25, "cl", { gramsPerMl: 1 })).toBe(250);
  });

  test("weighs pieces through the ingredient's own weight", () => {
    expect(toGrams(2, "pcs", { gramsPerPiece: 150 })).toBe(300);
  });

  test("refuses a volume with no density rather than assuming water", () => {
    // Honey is 1.42 g/ml — assuming 1.0 would understate the line by 40%.
    expect(toGrams(1, "cs", {})).toBeUndefined();
    expect(toGrams(1, "l", { gramsPerPiece: 150 })).toBeUndefined();
  });

  test("refuses a piece with no weight per piece", () => {
    expect(toGrams(2, "pcs", { gramsPerMl: 1 })).toBeUndefined();
  });
});

describe("serializeIngredients", () => {
  test("writes one line per ingredient, quantity and unit ahead of the name", () => {
    const text = serializeIngredients([
      { name: "flour", quantity: 200, unit: "g" },
      { name: "onion", quantity: 2, unit: "pcs" },
    ]);

    expect(text).toBe("200 g flour\n2 pcs onion");
  });

  test("keeps a fractional quantity exactly as stored", () => {
    const text = serializeIngredients([{ name: "olive oil", quantity: 1.5, unit: "cs" }]);

    expect(text).toBe("1.5 cs olive oil");
  });

  /**
   * The reason this does not reuse `formatQuantity`. That formatter rounds to one decimal, so a
   * quarter-teaspoon would come back as `0.3` — and because this same string seeds the editor and
   * feeds `recipeChangesOf`'s comparison, the rounded value is what a later save would persist.
   */
  test("does not round a quantity the display formatter would round", () => {
    const text = serializeIngredients([{ name: "cumin", quantity: 0.25, unit: "cc" }]);

    expect(text).toBe("0.25 cc cumin");
    expect(formatQuantity(0.25, "cc")).toBe("0.3 cc");
  });

  /** `unitLabel` spells `l` as `L`; the stored code is what a re-parse has to see. */
  test("writes the unit's stored code rather than its display label", () => {
    const text = serializeIngredients([{ name: "milk", quantity: 1, unit: "l" }]);

    expect(text).toBe("1 l milk");
    expect(formatQuantity(1, "l")).toBe("1 L");
  });

  test("returns an empty string for a recipe with no ingredients", () => {
    expect(serializeIngredients([])).toBe("");
  });
});

describe("pickQuantity", () => {
  const GNOCCHI = { defaultQuantity: 500, defaultUnit: "g" as const };

  test("takes both halves from the shopper when they typed both", () => {
    expect(pickQuantity({ amount: 2, unit: "pcs" }, GNOCCHI)).toEqual({ amount: 2, unit: "pcs" });
  });

  test("takes both halves from the row when the shopper typed neither", () => {
    expect(pickQuantity({ amount: null, unit: null }, GNOCCHI)).toEqual({ amount: 500, unit: "g" });
  });

  /**
   * The bug this exists for. "2 gnocchis" parses to an amount with no unit, and filling the halves
   * independently gave it the row's `g` — two GRAMS of a food sold in packets of 500.
   */
  test("does not pair a typed amount with the row's unit", () => {
    expect(pickQuantity({ amount: 2, unit: null }, GNOCCHI)).toEqual({ amount: 500, unit: "g" });
  });

  test("does not pair a typed unit with the row's amount", () => {
    expect(pickQuantity({ amount: null, unit: "pcs" }, GNOCCHI)).toEqual({ amount: 500, unit: "g" });
  });

  /** `0` is an amount the shopper gave, and `??` would have thrown it away. */
  test("treats a typed zero as typed", () => {
    expect(pickQuantity({ amount: 0, unit: "pcs" }, GNOCCHI)).toEqual({ amount: 0, unit: "pcs" });
  });

  test("reads undefined the same as null", () => {
    expect(pickQuantity({ amount: undefined, unit: undefined }, GNOCCHI)).toEqual({ amount: 500, unit: "g" });
  });
});
