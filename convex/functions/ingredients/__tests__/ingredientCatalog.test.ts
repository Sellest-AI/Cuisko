import { describe, expect, test } from "vitest";

import { toGrams } from "@shared/ingredients";

import { CATALOG } from "../ingredientCatalog";

const bySlug = (slug: string) => CATALOG.find((entry) => entry.slug === slug)!;

describe("catalog weights", () => {
  /**
   * The invariant the schema cannot express: an ingredient carries the ratio for the unit it is
   * itself measured in. Miss one and the unit that ingredient is most often written in is the one
   * quantity nothing can weigh — and a single unweighable line costs the whole recipe its
   * nutrition, so this fails loudly here rather than silently in a recipe.
   */
  test("every row can weigh its own default quantity", () => {
    const unweighable = CATALOG.filter(
      (entry) => toGrams(entry.defaultQuantity, entry.defaultUnit, entry) === undefined,
    );

    expect(unweighable.map((entry) => `${entry.slug} (${entry.defaultUnit})`)).toEqual([]);
  });

  test("no ratio is zero or negative", () => {
    for (const entry of CATALOG) {
      if (entry.gramsPerPiece !== undefined) expect(entry.gramsPerPiece).toBeGreaterThan(0);
      if (entry.gramsPerMl !== undefined) expect(entry.gramsPerMl).toBeGreaterThan(0);
    }
  });

  /**
   * Bought by weight, written by the spoonful — so their density is needed for a unit their own
   * `defaultUnit` never mentions, and the test above cannot see it missing. A key typo'd into a
   * slug that does not exist is silent everywhere else.
   */
  test("the spoon-measured pantry carries a density", () => {
    const spooned = ["salt", "flour-all-purpose", "white-sugar", "honey", "black-pepper", "butter"];

    for (const slug of spooned) {
      expect(toGrams(1, "tbsp", bySlug(slug))).toBeGreaterThan(0);
    }
  });

  test("counts pieces as a recipe writes them", () => {
    expect(toGrams(2, "pcs", bySlug("onion"))).toBe(300);
    expect(toGrams(3, "pcs", bySlug("egg-whole"))).toBe(150);
    // A clove, not a head — the one row where `pcs` had to pick a side.
    expect(toGrams(2, "pcs", bySlug("garlic"))).toBe(10);
  });
});

describe("catalog shelf life", () => {
  /**
   * Total over the catalog, because an undated purchase is read as "not urgent": a row missing
   * here would never be cooked first, and nothing else would notice.
   */
  test("every row keeps for a whole number of days, sealed and opened", () => {
    const undated = CATALOG.filter(
      (entry) =>
        !Number.isInteger(entry.shelfLifeDays) ||
        !Number.isInteger(entry.openedShelfLifeDays) ||
        entry.shelfLifeDays! <= 0 ||
        entry.openedShelfLifeDays! <= 0,
    );

    expect(undated.map((entry) => entry.slug)).toEqual([]);
  });

  test("opening never makes a row keep longer", () => {
    const longerOpened = CATALOG.filter(
      (entry) => entry.openedShelfLifeDays! > entry.shelfLifeDays!,
    );

    expect(longerOpened.map((entry) => entry.slug)).toEqual([]);
  });

  test("dates the form a shop sells, not the one a recipe names", () => {
    expect(bySlug("canned-tomatoes")).toMatchObject({ shelfLifeDays: 365, openedShelfLifeDays: 5 });
    expect(bySlug("milk-whole")).toMatchObject({ shelfLifeDays: 90, openedShelfLifeDays: 3 });
    expect(bySlug("tomato")).toMatchObject({ shelfLifeDays: 7, openedShelfLifeDays: 2 });
    expect(bySlug("pasta-dry")).toMatchObject({ shelfLifeDays: 730, openedShelfLifeDays: 365 });
  });
});
