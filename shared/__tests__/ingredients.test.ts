import { describe, expect, test } from "vitest";

import {
  formatQuantity,
  fromStockUnit,
  pickQuantity,
  serializeIngredients,
  stockUnitOf,
  toGrams,
  toStockUnit,
} from "../ingredients";

describe("stockUnitOf", () => {
  test("counts an ingredient in the base unit of the kind it is bought in", () => {
    expect(stockUnitOf("kg")).toBe("g");
    expect(stockUnitOf("l")).toBe("ml");
    expect(stockUnitOf("cs")).toBe("ml");
    expect(stockUnitOf("pcs")).toBe("pcs");
  });
});

describe("toStockUnit", () => {
  test("converts within one kind of unit without knowing anything about the ingredient", () => {
    expect(toStockUnit(1, "l", { defaultUnit: "ml" })).toBe(1000);
    expect(toStockUnit(2, "kg", { defaultUnit: "g" })).toBe(2000);
    expect(toStockUnit(6, "pcs", { defaultUnit: "pcs" })).toBe(6);
  });

  test("crosses kinds through grams, with the ratios both ends need", () => {
    // Milk bought in ml, written in grams: 515 g at 1.03 g/ml.
    expect(toStockUnit(515, "g", { defaultUnit: "ml", gramsPerMl: 1.03 })).toBeCloseTo(500);
    // Carrots bought by the piece, written in grams: 300 g at 150 g each.
    expect(toStockUnit(300, "g", { defaultUnit: "pcs", gramsPerPiece: 150 })).toBe(2);
    // Butter bought in grams, written in spoons: 15 ml at 0.91 g/ml.
    expect(toStockUnit(1, "cs", { defaultUnit: "g", gramsPerMl: 0.91 })).toBeCloseTo(13.65);
  });

  test("refuses to cross kinds when a ratio is missing", () => {
    expect(toStockUnit(300, "g", { defaultUnit: "pcs" })).toBeUndefined();
    expect(toStockUnit(1, "l", { defaultUnit: "g" })).toBeUndefined();
    expect(toStockUnit(2, "pcs", { defaultUnit: "ml", gramsPerPiece: 100 })).toBeUndefined();
  });
});

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

describe("fromStockUnit", () => {
  /** The list reads "0.5 kg", not "500 g": the household shops in the unit it buys the thing in. */
  test("converts out of the stock unit into the unit the ingredient is bought in", () => {
    expect(fromStockUnit(500, { defaultUnit: "kg" })).toBe(0.5);
    expect(fromStockUnit(1500, { defaultUnit: "l" })).toBe(1.5);
  });

  test("leaves a quantity already in its stock unit alone", () => {
    expect(fromStockUnit(347, { defaultUnit: "g" })).toBe(347);
  });

  /** No shop sells 1.3 onions, and this number is what goes on the list and comes back off it. */
  test("rounds pieces up to a whole", () => {
    expect(fromStockUnit(1.3, { defaultUnit: "pcs" })).toBe(2);
    expect(fromStockUnit(2, { defaultUnit: "pcs" })).toBe(2);
  });

  test("is the inverse of toStockUnit within one kind of unit", () => {
    const flour = { defaultUnit: "kg" } as const;

    expect(fromStockUnit(toStockUnit(2, "kg", flour)!, flour)).toBe(2);
  });
});
