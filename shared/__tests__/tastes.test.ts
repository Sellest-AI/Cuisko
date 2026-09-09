import { describe, expect, test } from "vitest";

import { NUTRITION_PREFERENCES } from "../preferences";
import { isTaste, TASTES } from "../tastes";
import { AUTHORED_TAGS, COMPUTED_TAGS } from "../tags";

/**
 * The `satisfies readonly AuthoredTag[]` in the source already makes an unknown value a compile
 * error. What it cannot catch is the direction that matters at runtime: a craving offered to a
 * user that no recipe carries steers the week nowhere, and nothing about that looks broken.
 */
describe("TASTES", () => {
  test.each(TASTES)("%s is a tag a recipe can actually carry", (taste) => {
    expect(AUTHORED_TAGS).toContain(taste);
  });

  /**
   * The regression the two hand-written lists this replaced actually shipped: `high-protein`,
   * `low-carb` and `low-calorie` sat in `MOODS`/`FOCUSES` **and** in `NUTRITION_PREFERENCES`, so
   * one wish was a week's steer in one place and a stored, aggregated preference in the other.
   * The two vocabularies are disjoint by construction now — computed against authored — and this
   * fails the moment somebody widens either one back across the line.
   */
  test("never overlaps the preferences a person stores", () => {
    for (const taste of TASTES) {
      expect(NUTRITION_PREFERENCES as readonly string[]).not.toContain(taste);
      expect(COMPUTED_TAGS as readonly string[]).not.toContain(taste);
    }
  });

  test("is a strict subset — a steer is a shortlist, not the whole tag vocabulary", () => {
    expect(TASTES.length).toBeLessThan(AUTHORED_TAGS.length);
  });

  test("holds no duplicates", () => {
    expect(new Set(TASTES).size).toBe(TASTES.length);
  });
});

describe("isTaste", () => {
  test("accepts every value on offer", () => {
    for (const taste of TASTES) expect(isTaste(taste)).toBe(true);
  });

  /** `main` is a real tag and still not a craving, which is the case a plain tag check would miss. */
  test.each(["main", "one-pan", "comfort", "high-protein", ""])("rejects %s", (value) => {
    expect(isTaste(value)).toBe(false);
  });
});
