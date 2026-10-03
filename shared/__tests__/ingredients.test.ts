import { describe, expect, test } from "vitest";

import {
  convertQuantity,
  eatenGrams,
  edibleGrams,
  FAT_USE_SHARE,
  formatQuantity,
  formatGroceryQuantity,
  fromStockUnit,
  isCookingFat,
  mergeGroupOf,
  mergeRecipeLines,
  normalizeUnit,
  pickQuantity,
  RECIPE_UNITS,
  roundQuantity,
  roundGroceryQuantity,
  serializeIngredients,
  stockUnitOf,
  toGrams,
  weighableUnits,
  toStockUnit,
  UNITS,
  unitScale,
} from "../ingredients";

describe("normalizeUnit", () => {
  test("gives back the stored code for a code", () => {
    expect(normalizeUnit("tbsp")).toBe("tbsp");
    expect(normalizeUnit("g")).toBe("g");
  });

  /** A slice is a recipe's word, not a shopper's: nothing is bought or stocked by the slice. */
  test("does not accept a slice from a shopper", () => {
    expect(normalizeUnit("slice")).toBeUndefined();
  });

  /**
   * The French spoons are what this vocabulary used to STORE, so a cook who learned them from the
   * app goes on typing them. They resolve to the English code rather than being rejected — and
   * rather than being handed back as themselves, which is what a type guard would have done and
   * what `vUnit` would then refuse at the mutation.
   */
  test("resolves the French spoon spellings onto the stored English codes", () => {
    expect(normalizeUnit("cs")).toBe("tbsp");
    expect(normalizeUnit("cc")).toBe("tsp");
  });

  test("is case-insensitive, because a shopper writing in a hurry means the same unit", () => {
    expect(normalizeUnit("CC")).toBe("tsp");
    expect(normalizeUnit("KG")).toBe("kg");
  });

  test("refuses a word that is not a unit, and an absent one", () => {
    expect(normalizeUnit("nope")).toBeUndefined();
    expect(normalizeUnit("")).toBeUndefined();
    expect(normalizeUnit(undefined)).toBeUndefined();
  });

  /**
   * Every caller hands this a string a person typed or a deep link carried, so the alias table is
   * asked about arbitrary words. Held in an object literal it answered for `Object.prototype` as
   * well — `aliases.constructor` is a function, which is truthy, so the sheet opened on
   * `?unit=constructor` and `STEPS[unit].filter(…)` threw on `undefined`. Hence the `Map`.
   */
  test("refuses a prototype key rather than answering with a function", () => {
    for (const key of ["constructor", "valueOf", "toString", "hasOwnProperty", "__proto__"])
      expect(normalizeUnit(key)).toBeUndefined();
  });
});

describe("stockUnitOf", () => {
  test("counts an ingredient in the base unit of the kind it is bought in", () => {
    expect(stockUnitOf("kg")).toBe("g");
    expect(stockUnitOf("l")).toBe("ml");
    expect(stockUnitOf("tbsp")).toBe("ml");
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
    expect(toStockUnit(1, "tbsp", { defaultUnit: "g", gramsPerMl: 0.91 })).toBeCloseTo(13.65);
  });

  test("refuses to cross kinds when a ratio is missing", () => {
    expect(toStockUnit(300, "g", { defaultUnit: "pcs" })).toBeUndefined();
    expect(toStockUnit(1, "l", { defaultUnit: "g" })).toBeUndefined();
    expect(toStockUnit(2, "pcs", { defaultUnit: "ml", gramsPerPiece: 100 })).toBeUndefined();
  });

  /**
   * The bug this unit exists for: "8 pcs" of bread against a row whose piece is a whole 250 g
   * baguette put two kilos of bread in a toast recipe. A slice is never the same kind as a stock
   * unit, so it always goes through grams — 8 × 35 g is 1.12 loaves, never 8.
   */
  test("counts slices as a fraction of the whole they are cut from, never as the whole", () => {
    const baguette = { defaultUnit: "pcs", gramsPerPiece: 250, gramsPerSlice: 35 } as const;

    expect(toStockUnit(8, "slice", baguette)).toBeCloseTo(1.12);
    expect(fromStockUnit(toStockUnit(8, "slice", baguette)!, baguette)).toBe(2);
  });

  test("weighs a slice into a row stocked in grams or millilitres through the same ratios", () => {
    // Cheese bought in grams: 3 slices at 30 g.
    expect(toStockUnit(3, "slice", { defaultUnit: "g", gramsPerSlice: 30 })).toBe(90);
    // Something sliced but bought by volume goes through its density as any weight would.
    expect(toStockUnit(2, "slice", { defaultUnit: "ml", gramsPerSlice: 20, gramsPerMl: 0.8 })).toBe(50);
  });

  test("refuses a slice with no slice weight, whatever else the row knows", () => {
    expect(toStockUnit(8, "slice", { defaultUnit: "pcs", gramsPerPiece: 250 })).toBeUndefined();
    expect(toStockUnit(8, "slice", { defaultUnit: "g" })).toBeUndefined();
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
    expect(toGrams(1, "tbsp", { gramsPerMl: 0.91 })).toBeCloseTo(13.65);
    expect(toGrams(1, "tsp", { gramsPerMl: 0.91 })).toBeCloseTo(4.55);
    expect(toGrams(25, "cl", { gramsPerMl: 1 })).toBe(250);
  });

  test("weighs pieces through the ingredient's own weight", () => {
    expect(toGrams(2, "pcs", { gramsPerPiece: 150 })).toBe(300);
  });

  /** A slice has its own ratio: a loaf's piece weight says nothing about how thick it is cut. */
  test("weighs slices through the ingredient's slice weight, never its piece weight", () => {
    expect(toGrams(8, "slice", { gramsPerSlice: 35 })).toBe(280);
    expect(toGrams(8, "slice", { gramsPerPiece: 250 })).toBeUndefined();
  });

  test("refuses a volume with no density rather than assuming water", () => {
    // Honey is 1.42 g/ml — assuming 1.0 would understate the line by 40%.
    expect(toGrams(1, "tbsp", {})).toBeUndefined();
    expect(toGrams(1, "l", { gramsPerPiece: 150 })).toBeUndefined();
  });

  test("refuses a piece with no weight per piece", () => {
    expect(toGrams(2, "pcs", { gramsPerMl: 1 })).toBeUndefined();
  });
});

/**
 * Every weight is as bought; nutrition counts only what is eaten. The two answers split here and
 * nowhere else, so the shell a shopper pays for never reaches a calorie total, and the calorie
 * total never shrinks what the shopping list buys.
 */
describe("edibleGrams", () => {
  const mussels = { gramsPerMl: 0.75, edibleShare: 0.4 };

  test("counts the eaten share of what toGrams weighs as bought", () => {
    expect(toGrams(1, "l", mussels)).toBe(750);
    expect(edibleGrams(1, "l", mussels)).toBeCloseTo(300);
  });

  test("applies the share in every unit, a mass unit included", () => {
    const thigh = { gramsPerPiece: 170, edibleShare: 0.7 };

    expect(edibleGrams(500, "g", thigh)).toBeCloseTo(350);
    expect(edibleGrams(1, "kg", thigh)).toBeCloseTo(700);
    expect(edibleGrams(2, "pcs", thigh)).toBeCloseTo(238);
  });

  test("counts the whole weight when the row states no share", () => {
    expect(edibleGrams(2, "pcs", { gramsPerPiece: 150 })).toBe(300);
    expect(edibleGrams(500, "g", {})).toBe(500);
  });

  test("is undefined exactly where toGrams is", () => {
    const rows = [{}, { gramsPerPiece: 150, edibleShare: 0.5 }, mussels, { gramsPerSlice: 35 }];

    for (const row of rows) {
      for (const unit of RECIPE_UNITS) {
        expect(edibleGrams(1, unit, row) === undefined).toBe(toGrams(1, unit, row) === undefined);
      }
    }
  });

  test("leaves what is bought alone: the shell still reaches the stock and the list", () => {
    const row = { ...mussels, defaultUnit: "g" } as const;

    expect(toStockUnit(1, "l", row)).toBe(750);
  });
});

/** The catalog's own figures, per 100 g: what each row is filed under and the fat it carries. */
const VEGETABLE_OIL = { category: "OIL", nutrition: { fat: 100 }, gramsPerMl: 0.92 } as const;
const GHEE = { category: "OIL", nutrition: { fat: 99.5 }, gramsPerMl: 0.91 } as const;
const BUTTER = { category: "DAIRY", nutrition: { fat: 81 }, gramsPerMl: 0.91 } as const;
const CHEDDAR = { category: "DAIRY", nutrition: { fat: 33 } } as const;
const WALNUTS = { category: "NUT", nutrition: { fat: 65 } } as const;
const CARROT = { category: "VEGETABLE", nutrition: { fat: 0.2 }, gramsPerPiece: 60 } as const;

describe("isCookingFat", () => {
  test("is every oil, ghee included", () => {
    expect(isCookingFat(VEGETABLE_OIL)).toBe(true);
    expect(isCookingFat(GHEE)).toBe(true);
  });

  /** Butter is filed under dairy for the diet flags, and it is the one cooking fat there. */
  test("is butter, which is dairy, and not a cheese, which is dairy too", () => {
    expect(isCookingFat(BUTTER)).toBe(true);
    expect(isCookingFat(CHEDDAR)).toBe(false);
  });

  test("is nothing else, however fatty", () => {
    expect(isCookingFat(WALNUTS)).toBe(false);
    expect(isCookingFat(CARROT)).toBe(false);
  });
});

/**
 * Japchae's 7 tbsp of vegetable oil, fried in batch after batch with the pan wiped between them,
 * is the case this exists for: counted whole, it put 48 g of oil on each of two plates.
 */
describe("eatenGrams", () => {
  test("counts the share of a cooking fat that stays on the plate", () => {
    const grams = edibleGrams(7, "tbsp", VEGETABLE_OIL)!;

    expect(eatenGrams(7, "tbsp", VEGETABLE_OIL, "fried")).toBeCloseTo(grams * FAT_USE_SHARE.fried);
    expect(eatenGrams(1, "l", VEGETABLE_OIL, "deepFried")).toBeCloseTo(920 * FAT_USE_SHARE.deepFried);
    expect(eatenGrams(50, "g", BUTTER, "fried")).toBeCloseTo(50 * FAT_USE_SHARE.fried);
  });

  test("counts all of a fat with no use: a dressing is eaten whole", () => {
    expect(eatenGrams(3, "tbsp", VEGETABLE_OIL)).toBe(edibleGrams(3, "tbsp", VEGETABLE_OIL));
  });

  /** A tag on a carrot is the model's mistake, and it must not take 40% of the carrot with it. */
  test("ignores a use on anything that is not a cooking fat", () => {
    expect(eatenGrams(2, "pcs", CARROT, "fried")).toBe(120);
    expect(eatenGrams(100, "g", WALNUTS, "deepFried")).toBe(100);
  });

  test("is undefined exactly where edibleGrams is", () => {
    expect(eatenGrams(1, "pcs", VEGETABLE_OIL, "fried")).toBeUndefined();
  });

  test("leaves what is bought alone: the whole 7 tbsp still leave the cellar", () => {
    expect(toStockUnit(7, "tbsp", { ...VEGETABLE_OIL, defaultUnit: "ml" })).toBe(105);
  });
});

describe("roundGroceryQuantity", () => {
  /** The bug this exists for: 100 g for three, cooked for one, read `33.333333333333336 g` on a tile. */
  test("raises a gram amount to a whole number", () => {
    expect(roundGroceryQuantity(100 / 3, "g")).toBe(34);
    expect(roundGroceryQuantity(33.1, "g")).toBe(34);
  });

  /** Up, never down: every amount on screen is bought, weighed or taken out, and short is worse. */
  test("never gives back less than it was handed", () => {
    expect(roundGroceryQuantity(0.2, "g")).toBe(1);
    expect(roundGroceryQuantity(1.21, "kg")).toBe(1.3);
  });

  /** Half a slice is not cut, any more than half an onion is bought. */
  test("raises a slice count to a whole", () => {
    expect(roundGroceryQuantity(1.2, "slice")).toBe(2);
    expect(roundGroceryQuantity(3, "slice")).toBe(3);
  });

  test("keeps one decimal on the units a shopper buys in tenths", () => {
    expect(roundGroceryQuantity(1.256, "kg")).toBe(1.3);
    expect(roundGroceryQuantity(0.75, "l")).toBe(0.8);
    expect(roundGroceryQuantity(0.25, "tsp")).toBe(0.3);
  });

  /**
   * A ceiling amplifies float noise instead of absorbing it — `13.200000000000003` would read
   * `13.3 kg` — so the epsilon guard is what makes the direction safe to apply.
   */
  test("takes the float noise off a difference rather than rounding it up", () => {
    expect(roundGroceryQuantity(33.3 - 20.1, "kg")).toBe(13.2);
    expect(roundGroceryQuantity(0.1 + 0.2, "l")).toBe(0.3);
    expect(roundGroceryQuantity((100 / 3) * 3, "g")).toBe(100);
  });

  test("returns a number that prints without a trailing zero", () => {
    expect(String(roundGroceryQuantity(2.04, "kg"))).toBe("2.1");
    expect(String(roundGroceryQuantity(33.34, "g"))).toBe("34");
  });

  /** 33 g owed on an ingredient shopped by the kilo is 0.033 kg — a need, not nothing. */
  test("never shows a positive amount as nothing", () => {
    expect(roundGroceryQuantity(0.033, "kg")).toBe(0.1);
    expect(roundGroceryQuantity(0.4, "ml")).toBe(1);
    expect(roundGroceryQuantity(0.2, "pcs")).toBe(1);
  });

  test("leaves zero and the whole numbers alone", () => {
    expect(roundGroceryQuantity(0, "kg")).toBe(0);
    expect(roundGroceryQuantity(500, "g")).toBe(500);
    expect(roundGroceryQuantity(2, "pcs")).toBe(2);
  });
});

describe("roundQuantity", () => {
  /** A cook told 2 onions for 1.3 puts too much in the pan; a shopper told 1.3 cannot buy it. */
  test("keeps a tenth of a piece", () => {
    expect(roundQuantity(1.3, "pcs")).toBe(1.3);
    expect(roundQuantity(1.34, "pcs")).toBe(1.3);
  });

  test("rounds to the nearest, not up", () => {
    expect(roundQuantity(66.2, "g")).toBe(66);
    expect(roundQuantity(66.6, "g")).toBe(67);
    expect(roundQuantity(2.04, "kg")).toBe(2);
  });

  /** 0.35 × 10 is 3.4999999999999996 in floating point, which would round a half down. */
  test("rounds a half up despite float noise", () => {
    expect(roundQuantity(0.35, "pcs")).toBe(0.4);
  });

  test("never shows a positive amount as nothing", () => {
    expect(roundQuantity(0.02, "pcs")).toBe(0.1);
    expect(roundQuantity(0.3, "g")).toBe(1);
  });

  test("leaves zero and the whole numbers alone", () => {
    expect(roundQuantity(0, "pcs")).toBe(0);
    expect(roundQuantity(2, "pcs")).toBe(2);
    expect(roundQuantity(500, "g")).toBe(500);
  });

  /** A slice is cut whole: only the piece gained a decimal. */
  test("keeps slices whole", () => {
    expect(roundQuantity(1.4, "slice")).toBe(1);
  });
});

describe("formatQuantity", () => {
  test("writes the cooking amount beside its unit", () => {
    expect(formatQuantity(1.34, "pcs")).toBe("1.3 pcs");
    expect(formatQuantity(66.2, "g", (unit) => `[${unit}]`)).toBe("66 [g]");
  });
});

describe("formatGroceryQuantity", () => {
  test("shows the amount at its unit's precision", () => {
    expect(formatGroceryQuantity(100 / 3, "g")).toBe("34 g");
    expect(formatGroceryQuantity(1.256, "kg")).toBe("1.3 kg");
    expect(formatGroceryQuantity(2, "kg")).toBe("2 kg");
  });

  test("spells the unit through the resolver it is given", () => {
    expect(formatGroceryQuantity(1.5, "tbsp", () => "c. à s.")).toBe("1.5 c. à s.");
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
    const text = serializeIngredients([{ name: "olive oil", quantity: 1.5, unit: "tbsp" }]);

    expect(text).toBe("1.5 tbsp olive oil");
  });

  /**
   * The reason this does not reuse `formatGroceryQuantity`. That formatter rounds to one decimal, so a
   * quarter-teaspoon would come back as `0.3` — and because this same string seeds the editor and
   * feeds `recipeChangesOf`'s comparison, the rounded value is what a later save would persist.
   */
  test("does not round a quantity the display formatter would round", () => {
    const text = serializeIngredients([{ name: "cumin", quantity: 0.25, unit: "tsp" }]);

    expect(text).toBe("0.25 tsp cumin");
    expect(formatGroceryQuantity(0.25, "tsp")).toBe("0.3 tsp");
  });

  /** `unitLabel` spells `l` as `L`; the stored code is what a re-parse has to see. */
  test("writes the unit's stored code rather than its display label", () => {
    const text = serializeIngredients([{ name: "milk", quantity: 1, unit: "l" }]);

    expect(text).toBe("1 l milk");
    expect(formatGroceryQuantity(1, "l")).toBe("1 L");
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

describe("mergeGroupOf", () => {
  test("puts every mass unit, metric and imperial, in one family", () => {
    for (const unit of ["kg", "g", "mg", "oz", "lb"] as const) expect(mergeGroupOf(unit)).toBe("mass");
  });

  test("puts l, ml and cl in one family", () => {
    for (const unit of ["l", "ml", "cl"] as const) expect(mergeGroupOf(unit)).toBe("volume");
  });

  /** Pieces cannot convert; spoons are cooking measures the list never holds. */
  test("never merges pieces or spoons", () => {
    for (const unit of ["pcs", "tbsp", "tsp"] as const) expect(mergeGroupOf(unit)).toBeNull();
  });

  test("rules on every unit there is", () => {
    for (const unit of UNITS) expect([null, "mass", "volume"]).toContain(mergeGroupOf(unit));
  });
});

describe("unitScale", () => {
  /** The order a merged row's unit moves in: up this ladder, never down. */
  test("ranks mass by grams and volume by millilitres", () => {
    expect(unitScale("kg")! > unitScale("lb")!).toBe(true);
    expect(unitScale("lb")! > unitScale("oz")!).toBe(true);
    expect(unitScale("oz")! > unitScale("g")!).toBe(true);
    expect(unitScale("g")! > unitScale("mg")!).toBe(true);
    expect(unitScale("l")! > unitScale("cl")!).toBe(true);
    expect(unitScale("cl")! > unitScale("ml")!).toBe(true);
  });

  test("has no place for pieces", () => {
    expect(unitScale("pcs")).toBeUndefined();
  });
});

describe("convertQuantity", () => {
  test("converts between every pair of mass units", () => {
    expect(convertQuantity(1, "kg", "g")).toBe(1000);
    expect(convertQuantity(500, "g", "kg")).toBe(0.5);
    expect(convertQuantity(1, "g", "mg")).toBe(1000);
    expect(convertQuantity(1, "lb", "oz")).toBeCloseTo(16);
    expect(convertQuantity(1, "kg", "lb")).toBeCloseTo(2.2046, 3);
  });

  test("converts between every pair of l, ml and cl", () => {
    expect(convertQuantity(1, "l", "ml")).toBe(1000);
    expect(convertQuantity(1, "l", "cl")).toBe(100);
    expect(convertQuantity(25, "cl", "ml")).toBe(250);
    expect(convertQuantity(500, "ml", "l")).toBe(0.5);
  });

  /** The maths is pure; `mergeGroupOf` is what keeps a spoon off the list, not this. */
  test("still converts a spoon, because the arithmetic does not know it is a spoon", () => {
    expect(convertQuantity(2, "tbsp", "ml")).toBe(30);
    expect(convertQuantity(1, "tsp", "cl")).toBe(0.5);
  });

  test("refuses a piece and refuses to cross dimensions", () => {
    expect(convertQuantity(3, "pcs", "g")).toBeUndefined();
    expect(convertQuantity(3, "g", "pcs")).toBeUndefined();
    expect(convertQuantity(3, "pcs", "pcs")).toBeUndefined();
    expect(convertQuantity(3, "g", "ml")).toBeUndefined();
    expect(convertQuantity(3, "l", "kg")).toBeUndefined();
  });

  test("returns the same value on the identity", () => {
    expect(convertQuantity(347, "g", "g")).toBe(347);
    expect(convertQuantity(1.5, "l", "l")).toBe(1.5);
  });
});

describe("weighableUnits", () => {
  test("offers only the mass units to an ingredient that knows no weight of its own", () => {
    expect(weighableUnits({})).toEqual(["kg", "g", "mg", "oz", "lb"]);
  });

  test("adds pieces, volumes and slices as each weight is known", () => {
    expect(weighableUnits({ gramsPerPiece: 60 })).toContain("pcs");
    expect(weighableUnits({ gramsPerMl: 0.91 })).toEqual(
      expect.arrayContaining(["ml", "cl", "l", "tbsp", "tsp"]),
    );
    expect(weighableUnits({ gramsPerSlice: 35 })).toContain("slice");
  });

  /** "An egg in ml" is the question with no answer; the list must not offer it. */
  test("never offers a volume to an ingredient with no density", () => {
    expect(weighableUnits({ gramsPerPiece: 60 })).not.toContain("ml");
  });
});

describe("mergeRecipeLines", () => {
  const WEIGHTS: Record<string, { gramsPerPiece?: number; gramsPerSlice?: number; gramsPerMl?: number }> = {
    cumin: {},
    chicken: { gramsPerPiece: 250 },
    oil: { gramsPerMl: 0.91 },
    onion: { gramsPerPiece: 150 },
  };
  const weightsOf = (ingredientId: string) => WEIGHTS[ingredientId] ?? {};

  /** The Moroccan harira: "cumin seeds" and "ground cumin" both resolved to the one cumin row. */
  test("sums two spoons of one ingredient into the smaller spoon", () => {
    const { lines, absorbed } = mergeRecipeLines(
      [
        { ingredientId: "cumin", position: 0, quantity: 1, unit: "tbsp" },
        { ingredientId: "cumin", position: 1, quantity: 2, unit: "tsp" },
      ],
      weightsOf,
    );

    expect(lines).toEqual([{ ingredientId: "cumin", position: 0, quantity: 5, unit: "tsp" }]);
    expect(absorbed).toBe(1);
  });

  /** Smallest-unit-wins alone wrote 1 l of stock and 1 tbsp of it as 67 tbsp. */
  test("sums a spoon into the metric unit beside it, never the other way", () => {
    const { lines } = mergeRecipeLines(
      [
        { ingredientId: "oil", position: 0, quantity: 1, unit: "l" },
        { ingredientId: "oil", position: 1, quantity: 1, unit: "tbsp" },
      ],
      weightsOf,
    );

    expect(lines).toEqual([{ ingredientId: "oil", position: 0, quantity: 1.015, unit: "l" }]);
  });

  test("sums two masses into the smaller unit used", () => {
    const { lines } = mergeRecipeLines(
      [
        { ingredientId: "chicken", position: 0, quantity: 1, unit: "kg" },
        { ingredientId: "chicken", position: 1, quantity: 300, unit: "g" },
      ],
      weightsOf,
    );

    expect(lines).toEqual([{ ingredientId: "chicken", position: 0, quantity: 1300, unit: "g" }]);
  });

  /** The stored number is compared exactly, so the ratio arithmetic's drift must not reach it. */
  test("stores a converted sum without float noise", () => {
    const { lines } = mergeRecipeLines(
      [
        { ingredientId: "chicken", position: 0, quantity: 0.2, unit: "lb" },
        { ingredientId: "chicken", position: 1, quantity: 1, unit: "g" },
      ],
      weightsOf,
    );

    // 0.2 × 453.59237 + 1 is 91.71847400000001 in floating point.
    expect(lines[0]).toMatchObject({ quantity: 91.718474, unit: "g" });
  });

  test("sums lines already in one unit", () => {
    const { lines } = mergeRecipeLines(
      [
        { ingredientId: "onion", position: 0, quantity: 4, unit: "pcs" },
        { ingredientId: "onion", position: 1, quantity: 2, unit: "pcs" },
      ],
      weightsOf,
    );

    expect(lines).toEqual([{ ingredientId: "onion", position: 0, quantity: 6, unit: "pcs" }]);
  });

  test("sums across kinds of unit through the ingredient's own weights, in grams", () => {
    const { lines } = mergeRecipeLines(
      [
        { ingredientId: "chicken", position: 0, quantity: 500, unit: "g" },
        { ingredientId: "chicken", position: 1, quantity: 2, unit: "pcs" },
      ],
      weightsOf,
    );

    expect(lines).toEqual([{ ingredientId: "chicken", position: 0, quantity: 1000, unit: "g" }]);
  });

  test("writes a merge with no mass line in it in grams", () => {
    const { lines } = mergeRecipeLines(
      [
        { ingredientId: "chicken", position: 0, quantity: 2, unit: "pcs" },
        { ingredientId: "chicken", position: 1, quantity: 1, unit: "slice" },
      ],
      (ingredientId) => ({ ...weightsOf(ingredientId), gramsPerSlice: 50 }),
    );

    expect(lines).toEqual([{ ingredientId: "chicken", position: 0, quantity: 550, unit: "g" }]);
  });

  /** A guess would put a made-up amount on the grocery list; two honest lines are better. */
  test("keeps the lines apart when one of them cannot be weighed", () => {
    const input = [
      { ingredientId: "chicken", position: 0, quantity: 500, unit: "g" as const },
      { ingredientId: "chicken", position: 1, quantity: 1, unit: "tbsp" as const },
    ];

    expect(mergeRecipeLines(input, weightsOf)).toEqual({ lines: input, absorbed: 0 });
  });

  test("folds into the group's last position, closing the gap and moving every later line down", () => {
    const { lines } = mergeRecipeLines(
      [
        { ingredientId: "cumin", position: 0, quantity: 1, unit: "tbsp" },
        { ingredientId: "onion", position: 1, quantity: 1, unit: "pcs" },
        { ingredientId: "cumin", position: 2, quantity: 2, unit: "tsp" },
        { ingredientId: "oil", position: 3, quantity: 2, unit: "tbsp" },
      ],
      weightsOf,
    );

    expect(lines.map(({ ingredientId, position }) => [ingredientId, position])).toEqual([
      ["onion", 0],
      ["cumin", 1],
      ["oil", 2],
    ]);
  });

  /**
   * The Katsudon on dev: dashi, rice, a pork fillet refused at import, rice. Folding the rice into
   * its FIRST line left dashi 0, rice 1, a recipe that read as whole and was tagged from a subset.
   */
  test("keeps a hole alive when every line above it belongs to a merged group", () => {
    const { lines } = mergeRecipeLines(
      [
        { ingredientId: "dashi", position: 0, quantity: 1, unit: "pcs" },
        { ingredientId: "rice", position: 1, quantity: 1, unit: "pcs" },
        // position 2 was refused at import
        { ingredientId: "rice", position: 3, quantity: 1, unit: "pcs" },
      ],
      weightsOf,
    );

    expect(lines.map(({ ingredientId, position }) => [ingredientId, position])).toEqual([
      ["dashi", 0],
      ["rice", 2],
    ]);
  });

  /** `refreshRecipe` reads a hole as a line the resolver refused; the merge must not erase that. */
  test("keeps the hole a refused line left, shifted with the lines around it", () => {
    const { lines } = mergeRecipeLines(
      [
        { ingredientId: "cumin", position: 0, quantity: 1, unit: "tbsp" },
        { ingredientId: "cumin", position: 1, quantity: 2, unit: "tsp" },
        // position 2 was refused at import
        { ingredientId: "onion", position: 3, quantity: 1, unit: "pcs" },
      ],
      weightsOf,
    );

    expect(lines.map(({ position }) => position)).toEqual([0, 2]);
  });

  test("leaves a recipe with no duplicate exactly as it was", () => {
    const input = [
      { ingredientId: "onion", position: 0, quantity: 1, unit: "pcs" as const },
      { ingredientId: "oil", position: 1, quantity: 2, unit: "tbsp" as const },
    ];

    expect(mergeRecipeLines(input, weightsOf)).toEqual({ lines: input, absorbed: 0 });
  });
});
