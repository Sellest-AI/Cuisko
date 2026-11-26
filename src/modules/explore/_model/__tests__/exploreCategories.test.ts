import { describe, expect, it } from "vitest";

import { categoryParamOf, EXPLORE_CATEGORIES, featuredCategoriesOf } from "../exploreCategories";

describe("featuredCategoriesOf", () => {
  it("deals the same tiles all day", () => {
    expect(featuredCategoriesOf("2026-11-26", 10)).toEqual(featuredCategoriesOf("2026-11-26", 10));
  });

  it("deals `count` distinct tiles, all from the list", () => {
    const tiles = featuredCategoriesOf("2026-11-26", 10);

    expect(tiles).toHaveLength(10);
    expect(new Set(tiles.map((tile) => tile.cuisine)).size).toBe(10);
    for (const tile of tiles) expect(EXPLORE_CATEGORIES).toContain(tile);
  });

  it("deals another hand on another day", () => {
    const days = ["2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"];
    const hands = new Set(days.map((day) => featuredCategoriesOf(day, 10).map((tile) => tile.cuisine).join()));

    expect(hands.size).toBeGreaterThan(1);
  });

  it("never deals more tiles than exist", () => {
    expect(featuredCategoriesOf("2026-11-26", 50)).toHaveLength(EXPLORE_CATEGORIES.length);
  });
});

describe("categoryParamOf", () => {
  it("reads a cuisine that has a tile", () => {
    expect(categoryParamOf("french")).toBe("french");
  });

  it("ignores a cuisine with no tile, an empty or repeated param, and a missing one", () => {
    expect(categoryParamOf("fusion")).toBeUndefined();
    expect(categoryParamOf("")).toBeUndefined();
    expect(categoryParamOf(["french"])).toBeUndefined();
    expect(categoryParamOf(undefined)).toBeUndefined();
  });
});
