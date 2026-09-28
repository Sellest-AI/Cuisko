import { describe, expect, test } from "vitest";

import {
  GROCERY_HINTS,
  IMPORTED_RECIPE,
  RECIPES,
  RECIPE_SEARCHES,
  SUGGESTED,
  WEEK,
  WEEK_SWAP,
} from "../fixtures";
import { EMPTY_PANTRY, add, buy, cook, missingFrom } from "../pantry";

/** The cellar as screen 2 leaves it: every hint added, then every card tapped into the cellar. */
const cellarAfterGroceries = () =>
  GROCERY_HINTS.reduce((pantry, { row }) => buy(add(pantry, row), row.ingredient), EMPTY_PANTRY).cellar;

const searched = (id: (typeof RECIPE_SEARCHES)[number]["id"]) =>
  RECIPE_SEARCHES.find((search) => search.id === id)!.results.map((recipe) => RECIPES[recipe]);

const HINTED = GROCERY_HINTS.map(({ row }) => row.ingredient);

describe("fixtures", () => {
  test("keys every recipe by its own id", () => {
    for (const [id, recipe] of Object.entries(RECIPES)) expect(recipe.id).toBe(id);
  });

  test("finds only recipes with both potatoes and cream when searching for them", () => {
    for (const recipe of searched("potatoes-cream")) {
      expect(recipe.lines.map((line) => line.ingredient)).toEqual(expect.arrayContaining(["potato", "cream"]));
    }
  });

  test("never shows the imported gratin before screen 4 imports it", () => {
    const shownBefore = [...SUGGESTED, ...RECIPE_SEARCHES.flatMap((search) => search.results)];

    expect(shownBefore).not.toContain(IMPORTED_RECIPE);
  });

  test("finds only recipes using something from the cellar for the cosy search", () => {
    for (const recipe of searched("cosy")) {
      expect(recipe.lines.some((line) => HINTED.includes(line.ingredient))).toBe(true);
    }
  });

  test("plans the imported gratin with all of it missing, since screen 2 stocks only carrots and onions", () => {
    const missing = missingFrom(cellarAfterGroceries(), RECIPES[IMPORTED_RECIPE].lines);

    expect(missing.map((line) => line.ingredient)).toEqual(["potato", "cream", "gruyere"]);
  });

  test("cooks the gratin without touching the carrots and onions screen 2 put in the cellar", () => {
    const { deductions } = cook({ toBuy: [], cellar: cellarAfterGroceries() }, RECIPES[IMPORTED_RECIPE].lines);

    expect(deductions).toEqual([]);
  });

  test("never serves the same recipe twice in the week, the swap included", () => {
    const swapped = WEEK.map((recipe, day) => (day === WEEK_SWAP.day ? WEEK_SWAP.recipe : recipe));

    expect(WEEK).not.toContain(WEEK_SWAP.recipe);
    expect(new Set(swapped).size).toBe(swapped.length);
    expect(WEEK_SWAP.day).toBeLessThan(WEEK.length);
  });
});
