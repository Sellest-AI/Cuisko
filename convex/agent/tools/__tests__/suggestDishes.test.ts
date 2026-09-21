import { describe, expect, expectTypeOf, it } from "vitest";

import { type SuggestedDish, toSuggestedDishes } from "../suggestDishes";

/**
 * The generation is a model call and is not tested here. What is tested is the boundary after it,
 * where a repeated or already-searched name would become a Marmiton search that finds nothing new.
 */
const _answer = (...dishes: { name: string; diet?: string | null }[]) => ({
  dishes: dishes.map(({ name, diet }) => ({ name, diet: diet ?? null })),
});

describe("toSuggestedDishes", () => {
  it("returns each dish with its diet, and none when the model wrote null", () => {
    const dishes = toSuggestedDishes(
      _answer({ name: "dal", diet: "vegan" }, { name: "butter chicken" }),
      { count: 6, avoid: [] },
    );

    expect(dishes).toEqual([{ name: "dal", diet: "vegan" }, { name: "butter chicken" }]);
  });

  it("drops a dish already searched, whatever its case, accents or plural", () => {
    const dishes = toSuggestedDishes(
      _answer({ name: "Lasagne" }, { name: "Pâtes carbonara" }, { name: "osso buco" }),
      { count: 6, avoid: ["lasagnes", "pates carbonara"] },
    );

    expect(dishes.map(({ name }) => name)).toEqual(["osso buco"]);
  });

  it("keeps the first of two spellings of one dish in the same answer", () => {
    const dishes = toSuggestedDishes(
      _answer({ name: "pad thaï" }, { name: "Pad Thai" }),
      { count: 6, avoid: [] },
    );

    expect(dishes.map(({ name }) => name)).toEqual(["pad thaï"]);
  });

  /** Accents and a plural "s" each fold away alone; folded together, pasta became a terrine. */
  it("keeps two dishes that differ by an accent AND a plural", () => {
    const dishes = toSuggestedDishes(
      _answer({ name: "pâté au saumon" }, { name: "pâtes au saumon" }),
      { count: 6, avoid: ["pâtes au saumon"] },
    );

    expect(dishes.map(({ name }) => name)).toEqual(["pâté au saumon"]);
  });

  it("keeps a variation, which is a different dish", () => {
    const dishes = toSuggestedDishes(
      _answer({ name: "lasagnes au saumon" }),
      { count: 6, avoid: ["lasagnes"] },
    );

    expect(dishes.map(({ name }) => name)).toEqual(["lasagnes au saumon"]);
  });

  it("trims names and drops an empty one", () => {
    const dishes = toSuggestedDishes(_answer({ name: "  gaspacho " }, { name: "  " }), {
      count: 6,
      avoid: [],
    });

    expect(dishes).toEqual([{ name: "gaspacho" }]);
  });

  it("cuts a long answer to the count asked for, and returns a short one as it is", () => {
    const answer = _answer({ name: "dal" }, { name: "naan" }, { name: "biryani" });

    expect(toSuggestedDishes(answer, { count: 2, avoid: [] })).toHaveLength(2);
    expect(toSuggestedDishes(answer, { count: 6, avoid: [] })).toHaveLength(3);
  });

  it("keeps the dish and drops a diet outside the two the ledger tracks", () => {
    const dishes = toSuggestedDishes(_answer({ name: "sole meunière", diet: "pescatarian" }), {
      count: 6,
      avoid: [],
    });

    expect(dishes).toEqual([{ name: "sole meunière" }]);
  });

  /** `pnpm typecheck` runs this one: the diet stays the ledger's two values (ADR 0010). */
  it("types the diet as the ledger's vocabulary", () => {
    expectTypeOf<SuggestedDish["diet"]>().toEqualTypeOf<"vegan" | "vegetarian" | undefined>();
  });
});
