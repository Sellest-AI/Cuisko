import { describe, expect, test } from "vitest";

import { COOKING_TIMES, ceilingMinutesOf, TIME_MARGIN } from "../cookingTimes";

describe("ceilingMinutesOf", () => {
  /**
   * `any` is the absence of a ceiling, not an infinite one: the caller omits the argument entirely,
   * so an unfiltered week takes the code path it took before the ceiling existed.
   */
  test("gives no ceiling at all for `any`", () => {
    expect(ceilingMinutesOf("any")).toBeNull();
  });

  test("applies the margin to a stated ceiling, as whole minutes", () => {
    expect(ceilingMinutesOf("20")).toBe(24);
    expect(ceilingMinutesOf("30")).toBe(36);
    expect(ceilingMinutesOf("60")).toBe(72);
  });

  /** A new entry in the vocabulary must not silently become a ceiling of `NaN`. */
  test("every answer but `any` resolves to a real number of minutes", () => {
    for (const time of COOKING_TIMES) {
      const ceiling = ceilingMinutesOf(time);

      if (time === "any") expect(ceiling).toBeNull();
      else expect(ceiling).toBeGreaterThan(0);
    }
  });

  test("the margin is what widens the ceiling, so moving it moves every answer", () => {
    expect(ceilingMinutesOf("30")).toBe(Math.round(30 * TIME_MARGIN));
  });
});
