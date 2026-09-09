import { describe, expect, test } from "vitest";

import { EXCLUSIVE_PREFERENCES, NUTRITION_PREFERENCES } from "../preferences";
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
