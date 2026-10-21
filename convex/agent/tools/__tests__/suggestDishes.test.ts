import { describe, expect, expectTypeOf, it } from "vitest";

import { suggestDishes, type SuggestedDish, toSuggestedDishes } from "../suggestDishes";

/**
 * The generation is a model call and is not tested here. What is tested is the boundary after it,
 * where a repeated or already-searched name would become a Marmiton search that finds nothing new.
 */
const _answer = (
  ...dishes: { name: string; nameEn?: string; veganEn?: string | null; main?: boolean; diet?: string | null }[]
) => ({
  dishes: dishes.map(({ name, nameEn, veganEn, main, diet }) => ({
    name,
    nameEn: nameEn ?? name,
    veganEn: veganEn ?? null,
    main: main ?? true,
    diet: diet ?? null,
  })),
});

describe("toSuggestedDishes", () => {
  it("returns each dish with its diet, and none when the model wrote null", () => {
    const dishes = toSuggestedDishes(
      _answer({ name: "dal", diet: "vegan" }, { name: "butter chicken" }),
      { count: 6, avoid: [] },
    );

    expect(dishes).toEqual([
      { name: "dal", nameEn: "dal", diet: "vegan" },
      { name: "butter chicken", nameEn: "butter chicken" },
    ]);
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

    expect(dishes).toEqual([{ name: "gaspacho", nameEn: "gaspacho" }]);
  });

  it("cuts a long answer to the count asked for, and returns a short one as it is", () => {
    const answer = _answer({ name: "dal" }, { name: "naan" }, { name: "biryani" });

    expect(toSuggestedDishes(answer, { count: 2, avoid: [] })).toHaveLength(2);
    expect(toSuggestedDishes(answer, { count: 6, avoid: [] })).toHaveLength(3);
  });

  it("keeps a pescatarian dish's diet, which a pescatarian ask is checked against", () => {
    const dishes = toSuggestedDishes(_answer({ name: "sole meunière", diet: "pescatarian" }), {
      count: 6,
      avoid: [],
    });

    expect(dishes).toEqual([{ name: "sole meunière", nameEn: "sole meunière", diet: "pescatarian" }]);
  });

  it("keeps the dish and drops a diet outside the three an ask can name", () => {
    const dishes = toSuggestedDishes(_answer({ name: "osso buco", diet: "omnivore" }), { count: 6, avoid: [] });

    expect(dishes).toEqual([{ name: "osso buco", nameEn: "osso buco" }]);
  });

  /** `pnpm typecheck` runs this one: the diet stays the ledger's three values (ADR 0010). */
  it("types the diet as the ledger's vocabulary", () => {
    expectTypeOf<SuggestedDish["diet"]>().toEqualTypeOf<"vegan" | "vegetarian" | "pescatarian" | undefined>();
  });
});

describe("toSuggestedDishes, the English name", () => {
  it("returns the English name next to the French one, trimmed", () => {
    const dishes = toSuggestedDishes(_answer({ name: "hachis parmentier", nameEn: " cottage pie " }), {
      count: 6,
      avoid: [],
    });

    expect(dishes).toEqual([{ name: "hachis parmentier", nameEn: "cottage pie" }]);
  });

  /** An empty English name would match no BBC Good Food slug; the French one sometimes does. */
  it("falls back to the French name when the English one is empty", () => {
    const dishes = toSuggestedDishes(_answer({ name: "bibimbap", nameEn: "  " }), { count: 6, avoid: [] });

    expect(dishes).toEqual([{ name: "bibimbap", nameEn: "bibimbap" }]);
  });
});

describe("toSuggestedDishes, the vegan version", () => {
  it("returns the vegan version the model named, trimmed", () => {
    const dishes = toSuggestedDishes(
      _answer({ name: "boeuf bourguignon", nameEn: "beef bourguignon", veganEn: " mushroom bourguignon " }),
      { count: 6, avoid: [] },
    );

    expect(dishes).toEqual([{ name: "boeuf bourguignon", nameEn: "beef bourguignon", veganEn: "mushroom bourguignon" }]);
  });

  it("returns none when the model wrote null, as for a dish whose animal product is the dish", () => {
    const [quiche] = toSuggestedDishes(_answer({ name: "quiche lorraine", veganEn: null }), { count: 6, avoid: [] });

    expect(quiche).not.toHaveProperty("veganEn");
  });

  it("drops the vegan version of a dish that is already vegan", () => {
    const [dal] = toSuggestedDishes(_answer({ name: "dal", diet: "vegan", veganEn: "vegan dal" }), {
      count: 6,
      avoid: [],
    });

    expect(dal).not.toHaveProperty("veganEn");
  });
});

/** The catalog plans lunches and dinners. A dessert that slips past the prompt is a wasted import. */
describe("toSuggestedDishes, main plates only", () => {
  it("drops a dish the model marks as not a main plate, and keeps the mains", () => {
    const dishes = toSuggestedDishes(
      _answer({ name: "tiramisu", main: false }, { name: "osso buco" }, { name: "bruschetta", main: false }),
      { count: 6, avoid: [] },
    );

    expect(dishes.map(({ name }) => name)).toEqual(["osso buco"]);
  });

  it("does not count a dropped dish against the count", () => {
    const dishes = toSuggestedDishes(_answer({ name: "tiramisu", main: false }, { name: "osso buco" }), {
      count: 1,
      avoid: [],
    });

    expect(dishes.map(({ name }) => name)).toEqual(["osso buco"]);
  });
});

/**
 * Refused before the model is called: the input is parsed first, so no ctx is needed to reach the
 * refusal, and a model call never happens for an ask nothing can fit.
 */
describe("suggestDishes, the constraints it refuses", () => {
  const _ask = (seeks: string[]) => () =>
    suggestDishes.run({} as never, { cuisine: "indian", count: 6, avoid: [], constraints: { seeks } } as never);

  it("refuses a light and a substantial dish at once", () => {
    expect(_ask(["low-calorie", "high-calorie"])).toThrow();
  });

  it("refuses more than two goals", () => {
    expect(_ask(["high-protein", "low-carb", "iron-rich"])).toThrow();
  });
});
