import { describe, expect, test } from "vitest";

import { resolveSeeks } from "../preferences";

describe("resolveSeeks", () => {
  test("adds a preference that was not sought", () => {
    expect(resolveSeeks([], "high-protein")).toEqual(["high-protein"]);
  });

  test("removes one that was", () => {
    expect(resolveSeeks(["high-protein", "low-carb"], "low-carb")).toEqual(["high-protein"]);
  });

  /**
   * The rule this file exists for. It is enforced nowhere else — the validator accepts the pair on
   * purpose — so these two cases are the whole guarantee that a row holding both never gets built.
   */
  test("switching on high-calorie switches low-calorie off", () => {
    expect(resolveSeeks(["low-calorie"], "high-calorie")).toEqual(["high-calorie"]);
  });

  test("switching on low-calorie switches high-calorie off", () => {
    expect(resolveSeeks(["high-calorie"], "low-calorie")).toEqual(["low-calorie"]);
  });

  test("never returns both halves of the pair, from any starting point", () => {
    const starts = [[], ["low-calorie"], ["high-calorie"], ["high-protein", "low-calorie"]] as const;

    for (const start of starts) {
      for (const toggled of ["low-calorie", "high-calorie"] as const) {
        const result = resolveSeeks([...start], toggled);

        expect(result.includes("low-calorie") && result.includes("high-calorie")).toBe(false);
      }
    }
  });

  /** Turning one of the pair off turns nothing on: not wanting either is an ordinary answer. */
  test("leaves the pair empty when the sought half is switched off", () => {
    expect(resolveSeeks(["low-calorie"], "low-calorie")).toEqual([]);
  });

  /** A preference outside the pair drops nothing, whichever half is currently sought. */
  test("keeps an exclusive preference when a non-exclusive one is added", () => {
    expect(resolveSeeks(["high-calorie"], "high-protein")).toEqual(["high-protein", "high-calorie"]);
  });

  /** NUTRITION_PREFERENCES order: high-protein, low-carb, low-calorie, high-calorie. */
  test("returns the vocabulary order whatever order the taps came in", () => {
    expect(resolveSeeks(["low-carb"], "high-protein")).toEqual(["high-protein", "low-carb"]);
  });

  test("never mutates the list it was given", () => {
    const seeks = ["low-calorie"] as const;

    resolveSeeks([...seeks], "high-calorie");

    expect(seeks).toEqual(["low-calorie"]);
  });
});
