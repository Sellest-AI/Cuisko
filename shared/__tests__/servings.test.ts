import { describe, expect, test } from "vitest";

import { scaleQuantity } from "../servings";

describe("scaleQuantity", () => {
  test("scales in proportion: 1000 g of potatoes for 4 is 500 g for 2 and 1500 g for 6", () => {
    expect(scaleQuantity(1000, 4, 2)).toBe(500);
    expect(scaleQuantity(1000, 4, 6)).toBe(1500);
  });

  test("leaves the amount exact, for whoever draws it to round", () => {
    expect(scaleQuantity(1000, 3, 1)).toBeCloseTo(333.333, 3);
  });

  test("returns the written amount for the servings it was written for", () => {
    expect(scaleQuantity(50, 4, 4)).toBe(50);
  });

  test("a recipe that serves nobody has no ratio: the amount comes back untouched, never Infinity", () => {
    expect(scaleQuantity(200, 0, 2)).toBe(200);
    expect(scaleQuantity(200, -1, 2)).toBe(200);
  });
});
