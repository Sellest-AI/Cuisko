import { describe, expect, test } from "vitest";

import { toGrams } from "../ingredients";

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
