import { describe, expect, test } from "vitest";

import { DIETS, type Diet, mostPermissiveDietOf } from "../diets";

describe("the vocabulary", () => {
  /**
   * The order IS the semantics — `mostPermissiveDietOf` is a maximum over these indexes and
   * `dietTagsOf` reads the result as a nesting. Sorting this list alphabetically would silently
   * re-tag every recipe in the database, so the order is pinned here rather than left to a comment.
   */
  test("runs strictest to most permissive", () => {
    expect(DIETS).toEqual(["vegan", "vegetarian", "pescatarian", "omnivore"]);
  });
});

describe("mostPermissiveDietOf", () => {
  test.each(DIETS)("answers %s for a list of only that", (diet) => {
    expect(mostPermissiveDietOf([diet, diet])).toBe(diet);
  });

  test("answers the most permissive value present", () => {
    expect(mostPermissiveDietOf(["vegan", "vegetarian"])).toBe("vegetarian");
    expect(mostPermissiveDietOf(["vegan", "vegetarian", "pescatarian"])).toBe("pescatarian");
    expect(mostPermissiveDietOf(["vegetarian", "omnivore"])).toBe("omnivore");
  });

  /** A maximum, not a vote: one omnivore line settles the dish however many plants surround it. */
  test("lets a single permissive line decide against any number of plants", () => {
    expect(mostPermissiveDietOf(["vegan", "vegan", "vegan", "vegan", "omnivore"])).toBe("omnivore");
  });

  test("does not depend on the order of the lines", () => {
    const lines: Diet[] = ["pescatarian", "vegan", "vegetarian"];
    expect(mostPermissiveDietOf(lines)).toBe(mostPermissiveDietOf([...lines].reverse()));
  });

  /**
   * Vacuously vegan, by the rule that a sum of nothing is zero. `computeTags` never hands over an
   * empty list — a recipe with no lines is refused before it gets here.
   */
  test("treats no lines as containing nothing", () => {
    expect(mostPermissiveDietOf([])).toBe("vegan");
  });
});
