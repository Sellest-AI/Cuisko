import { describe, expect, test } from "vitest";

import { convertLine, displayUnits, type Conversion } from "../units";

/** A whole chicken: counted in pieces, never poured. */
const CHICKEN: Conversion = { defaultUnit: "pcs", gramsPerPiece: 1500 };
/** Sold loose and weighed, counted in the recipe. */
const ONION: Conversion = { defaultUnit: "g", gramsPerPiece: 150 };
/** Bought in cl, so its volume reads in cl. */
const MILK: Conversion = { defaultUnit: "cl", gramsPerMl: 1.03 };
const BAGUETTE: Conversion = { defaultUnit: "pcs", gramsPerPiece: 250, gramsPerSlice: 35 };
/** A cook's own ingredient nothing has weighed yet. */
const UNWEIGHED: Conversion = { defaultUnit: "pcs" };

describe("displayUnits", () => {
  test("starts at the line's own unit and adds one unit per other kind", () => {
    expect(displayUnits("g", CHICKEN)).toEqual(["g", "pcs"]);
    expect(displayUnits("pcs", ONION)).toEqual(["pcs", "g"]);
  });

  /** The line's own unit stands for its kind, so "2 kg" never offers grams as a second stop. */
  test("never offers a second unit of the line's own kind", () => {
    expect(displayUnits("kg", CHICKEN)).toEqual(["kg", "pcs"]);
    expect(displayUnits("ml", MILK)).toEqual(["ml", "g"]);
  });

  test("reads another kind in the ingredient's default unit when it is of that kind", () => {
    expect(displayUnits("g", MILK)).toEqual(["g", "cl"]);
  });

  test("offers only the kinds the ingredient can be weighed in", () => {
    expect(displayUnits("g", CHICKEN)).not.toContain("ml");
    expect(displayUnits("g", ONION)).not.toContain("ml");
  });

  test("keeps the line as written when the ingredient carries no weight", () => {
    expect(displayUnits("pcs", UNWEIGHED)).toEqual(["pcs"]);
  });

  /** Nothing can be converted from a unit the ingredient cannot weigh. */
  test("keeps the line as written when its own unit cannot be weighed", () => {
    expect(displayUnits("cl", CHICKEN)).toEqual(["cl"]);
  });

  test("keeps a slice line in slices, and offers slices to no other line", () => {
    expect(displayUnits("slice", BAGUETTE)).toEqual(["slice"]);
    expect(displayUnits("pcs", BAGUETTE)).toEqual(["pcs", "g"]);
  });
});

describe("convertLine", () => {
  test("goes through the piece weight between pieces and mass", () => {
    expect(convertLine(500, "g", "pcs", CHICKEN)).toBeCloseTo(1 / 3);
    expect(convertLine(2, "pcs", "g", ONION)).toBe(300);
  });

  test("goes through the density between volume and mass", () => {
    expect(convertLine(10, "cl", "g", MILK)).toBeCloseTo(103);
    expect(convertLine(103, "g", "cl", MILK)).toBeCloseTo(10);
  });

  /** A kilo is a thousand grams whatever it weighs; no ratio from the row is needed. */
  test("converts within a kind without the ingredient's weights", () => {
    expect(convertLine(50, "cl", "ml", UNWEIGHED)).toBe(500);
  });

  test("returns the quantity untouched in its own unit", () => {
    expect(convertLine(4, "slice", "slice", BAGUETTE)).toBe(4);
  });

  test("answers undefined when either end cannot be weighed", () => {
    expect(convertLine(500, "g", "cl", CHICKEN)).toBeUndefined();
    expect(convertLine(1, "pcs", "g", UNWEIGHED)).toBeUndefined();
  });
});
