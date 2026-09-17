import { describe, expect, test } from "vitest";

import { EXCLUSIVE_PREFERENCES, matchesSeeks, NUTRITION_PREFERENCES } from "../preferences";
import { COMPUTED_TAGS } from "../tags";

/**
 * The `satisfies readonly ComputedTag[]` in the source already makes an unknown value a compile
 * error. What it cannot catch is the direction that matters at runtime: a preference offered to a
 * user that no recipe carries returns an empty list forever, and nothing about that looks broken.
 */
describe("NUTRITION_PREFERENCES", () => {
  test.each(NUTRITION_PREFERENCES)("%s is a tag a recipe can actually carry", (preference) => {
    expect(COMPUTED_TAGS).toContain(preference);
  });

  /**
   * Strict, not equal. The other computed tags are diet and free-from claims, already answered by
   * `diet` and `avoids` on the same row — so this list growing to match `COMPUTED_TAGS` means the
   * same question is being asked twice in two vocabularies that aggregate differently.
   */
  test("is a strict subset — it never covers the whole computed vocabulary", () => {
    expect(NUTRITION_PREFERENCES.length).toBeLessThan(COMPUTED_TAGS.length);
  });

  test("holds no duplicates", () => {
    expect(new Set(NUTRITION_PREFERENCES).size).toBe(NUTRITION_PREFERENCES.length);
  });
});

describe("EXCLUSIVE_PREFERENCES", () => {
  test("names only values that are on offer", () => {
    for (const preference of EXCLUSIVE_PREFERENCES) {
      expect(NUTRITION_PREFERENCES).toContain(preference);
    }
  });
});

describe("matchesSeeks", () => {
  test("nothing sought matches anything, a bare recipe included", () => {
    expect(matchesSeeks([], [])).toBe(true);
    expect(matchesSeeks(["high-calorie", "quick"], [])).toBe(true);
  });

  test("one seek needs that tag", () => {
    expect(matchesSeeks(["high-protein", "vegan"], ["high-protein"])).toBe(true);
    expect(matchesSeeks(["low-carb", "vegan"], ["high-protein"])).toBe(false);
  });

  /** AND, not OR: "high-protein and low-carb" is both, and a recipe fitting one was not asked for. */
  test("two seeks need both", () => {
    expect(matchesSeeks(["high-protein", "low-carb"], ["high-protein", "low-carb"])).toBe(true);
    expect(matchesSeeks(["high-protein"], ["high-protein", "low-carb"])).toBe(false);
  });

  /**
   * The inverse of the untimed rule: a recipe `computeTags` could not weigh has no nutrition claim,
   * and "not shown to be high-protein" is not "high-protein". Letting it through would hand a cook
   * seeking light meals the very recipes nobody has checked.
   */
  test("a recipe with no nutrition tags matches nothing sought", () => {
    expect(matchesSeeks([], ["low-calorie"])).toBe(false);
    expect(matchesSeeks(["vegan", "quick"], ["low-calorie"])).toBe(false);
  });

  /** Unsatisfiable, not an error — see `EXCLUSIVE_PREFERENCES` on why the validator lets the pair in. */
  test("the exclusive pair matches no recipe", () => {
    expect(matchesSeeks(["low-calorie"], [...EXCLUSIVE_PREFERENCES])).toBe(false);
    expect(matchesSeeks(["high-calorie"], [...EXCLUSIVE_PREFERENCES])).toBe(false);
  });
});
