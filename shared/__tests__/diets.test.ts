import { describe, expect, test } from "vitest";

import { DIETS, type Diet, fitsDiet, mostPermissiveDietOf, strictestDietOf } from "../diets";

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

describe("fitsDiet", () => {
  test("a stricter dish suits a looser eater, never the reverse", () => {
    expect(fitsDiet("vegan", "pescatarian")).toBe(true);
    expect(fitsDiet("vegetarian", "vegetarian")).toBe(true);
    expect(fitsDiet("pescatarian", "vegetarian")).toBe(false);
  });

  test("a dish with no diet has meat, and suits only an omnivore", () => {
    expect(fitsDiet(undefined, "pescatarian")).toBe(false);
    expect(fitsDiet(undefined, "omnivore")).toBe(true);
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

describe("strictestDietOf", () => {
  test.each(DIETS)("answers %s for a table of only that", (diet) => {
    expect(strictestDietOf([diet, diet])).toBe(diet);
  });

  test("answers the strictest value present", () => {
    expect(strictestDietOf(["vegetarian", "omnivore"])).toBe("vegetarian");
    expect(strictestDietOf(["pescatarian", "vegetarian"])).toBe("vegetarian");
    expect(strictestDietOf(["vegan", "vegetarian", "omnivore"])).toBe("vegan");
  });

  /** A minimum, not a vote: one vegan settles the table however many omnivores surround them. */
  test("lets a single vegan decide against any number of omnivores", () => {
    expect(strictestDietOf(["omnivore", "omnivore", "omnivore", "vegan"])).toBe("vegan");
  });

  test("does not depend on the order of the members", () => {
    const members: Diet[] = ["pescatarian", "omnivore", "vegetarian"];
    expect(strictestDietOf(members)).toBe(strictestDietOf([...members].reverse()));
  });

  /**
   * The two agree on a singleton and disagree on everything else — which is the whole point of
   * having both, and the property that breaks first if either reduce is written the wrong way
   * round.
   */
  test.each(DIETS)("agrees with mostPermissiveDietOf on a single %s", (diet) => {
    expect(strictestDietOf([diet])).toBe(mostPermissiveDietOf([diet]));
  });

  /**
   * The identity for a minimum, and the opposite end from `mostPermissiveDietOf`'s `vegan` for
   * exactly the same reason: nobody at the table constrains nothing.
   */
  test("treats no members as constraining nothing", () => {
    expect(strictestDietOf([])).toBe("omnivore");
  });
});
