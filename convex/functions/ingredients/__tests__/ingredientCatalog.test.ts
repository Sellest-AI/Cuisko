import { describe, expect, test } from "vitest";

import type { Category } from "@shared/categories";
import { type RecipeUnit, toGrams } from "@shared/ingredients";

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

  /**
   * A recipe writes a food in the unit a COOK uses, whatever the shop sells it by: "2 carottes"
   * of a row sold by the kilo, "1 tsp of harissa" of one sold by the jar. A row that cannot weigh
   * that unit costs every recipe using it its nutrition — "2 carottes" alone blanked 24.
   *
   * So the rule is over the whole catalog, by category, and a row added tomorrow is held to it
   * the day it lands. What a category rules in is decided here; what it rules out is named in the
   * exemptions with the reason, so leaving a row unweighed is a choice someone reviewed.
   */
  const LEAVES = "leaves, with no single one to count";
  const HANDFUL = "counted by the handful or the punnet, never one at a time";

  test.each<{ unit: RecipeUnit; categories: Category[]; exempt: Record<string, string> }>([
    {
      unit: "pcs",
      categories: ["VEGETABLE", "FRUIT", "HERB"],
      exempt: {
        spinach: LEAVES, kale: LEAVES, chard: LEAVES, arugula: LEAVES, "lambs-lettuce": LEAVES,
        "bean-sprouts": HANDFUL, "green-beans": HANDFUL, peas: HANDFUL, blueberry: HANDFUL,
        raspberry: HANDFUL, blackberry: HANDFUL, grape: HANDFUL, "raisins-dried": HANDFUL,
        "corn-sweet": "kernels from a tin; a cob would be a row of its own",
        watermelon: "bought whole and written by the slice or in grams, never as one",
        "coconut-fresh": "the shell and water outweigh the flesh, so a piece weight would lie",
        "lemon-juice": "a liquid",
      },
    },
    {
      unit: "tsp",
      categories: ["SPICE", "HERB", "SEED", "CONDIMENT", "SWEETENER", "OIL"],
      exempt: { "bay-leaf": "counted by the leaf, never spooned" },
    },
  ])("every $categories row can be weighed in $unit", ({ unit, categories, exempt }) => {
    const inScope = CATALOG.filter((entry) => categories.includes(entry.category));
    const unweighable = inScope.filter((entry) => toGrams(1, unit, entry) === undefined);

    expect(
      unweighable.filter((entry) => !(entry.slug in exempt)).map((entry) => `${entry.slug} (${entry.category})`),
    ).toEqual([]);
    // An exemption for a row that is gone, out of scope, or weighable after all is a stale reason.
    expect(Object.keys(exempt).filter((slug) => !unweighable.some((entry) => entry.slug === slug))).toEqual([]);
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
