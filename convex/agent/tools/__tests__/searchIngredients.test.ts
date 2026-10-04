import { describe, expect, it, vi } from "vitest";

import { searchIngredientsTool } from "../searchIngredients";

type Ctx = Parameters<ReturnType<typeof searchIngredientsTool>["run"]>[0];

/** A catalog row as `searchCatalog` hands it back, trimmed to what the tool reads. */
const _row = (
  name: string,
  weights: { gramsPerPiece?: number; gramsPerMl?: number } = {},
  aliases?: string[],
) => ({
  _id: `id-${name}`,
  name,
  ...(aliases && { aliases }),
  nutrition: { calories: 142.6, protein: 12.56, fat: 9.9, carbohydrates: 0.72, sodium: 140.4 },
  nutriScore: { grade: "A", points: -1 },
  ...weights,
});

/** A ctx whose search answers from a table of term → rows, and records each term it was asked. */
const _ctx = (catalog: Record<string, ReturnType<typeof _row>[]>) => {
  const runQuery = vi.fn(async (_ref: unknown, { query }: { query: string }) => catalog[query] ?? []);
  return { ctx: { runQuery } as unknown as Ctx, runQuery };
};

const _search = (ctx: Ctx, queries: string[]) => searchIngredientsTool({ locale: "fr" }).run(ctx, { queries });

describe("searchIngredientsTool", () => {
  it("answers each name beside what it found, empty when nothing matched", async () => {
    const { ctx } = _ctx({ oeuf: [_row("oeuf", { gramsPerPiece: 50 })] });

    const found = await _search(ctx, ["oeuf", "licorne"]);

    expect(found.map(({ query }) => query)).toEqual(["oeuf", "licorne"]);
    expect(found[1]?.ingredients).toEqual([]);
  });

  it("hands out the stored facts per 100 g, rounded, with the grade alone", async () => {
    const { ctx } = _ctx({ oeuf: [_row("oeuf", { gramsPerPiece: 50 })] });

    const [egg] = (await _search(ctx, ["oeuf"]))[0]!.ingredients;

    expect(egg).toMatchObject({
      id: "id-oeuf",
      name: "oeuf",
      per100g: { calories: 143, protein: 13, fat: 10, carbohydrates: 1, sodium: 140 },
      nutriScore: "A",
    });
  });

  /**
   * The other names the row answers to, so a model reading "jeune pousse d'épinard" → "épinard"
   * can see the catalog filed that word under that row, rather than guess it is only the nearest.
   */
  it("hands out the row's aliases in the search language, and none when it has none", async () => {
    const { ctx } = _ctx({
      "jeune pousse d'épinard": [_row("épinard", {}, ["jeune pousse d'épinard", "pousse d'épinard"])],
      oeuf: [_row("oeuf", { gramsPerPiece: 50 }, [])],
    });

    const [spinach, egg] = (await _search(ctx, ["jeune pousse d'épinard", "oeuf"])).map(
      ({ ingredients }) => ingredients[0]!,
    );

    expect(spinach!.aliases).toEqual(["jeune pousse d'épinard", "pousse d'épinard"]);
    expect(egg).not.toHaveProperty("aliases");
  });

  /** What lets "an egg" reach the calculator as one piece, and never as millilitres. */
  it("offers the units the row can be weighed in", async () => {
    const { ctx } = _ctx({ oeuf: [_row("oeuf", { gramsPerPiece: 50 })], huile: [_row("huile", { gramsPerMl: 0.91 })] });

    const [oeuf, huile] = (await _search(ctx, ["oeuf", "huile"])).map(({ ingredients }) => ingredients[0]!);

    expect(oeuf!.units).toContain("pcs");
    expect(oeuf!.units).not.toContain("ml");
    expect(huile!.units).toContain("tbsp");
  });

  it("searches a repeated or padded name once", async () => {
    const { ctx, runQuery } = _ctx({});

    await _search(ctx, ["oeuf", " oeuf "]);

    expect(runQuery).toHaveBeenCalledTimes(1);
  });

  /** The rule `searchRecipesTool` pins: a name that names nothing is no name. */
  it("skips a blank name or a word for nothing beside a real one", async () => {
    const { ctx, runQuery } = _ctx({ oeuf: [_row("oeuf", { gramsPerPiece: 50 })] });

    const found = await _search(ctx, ["oeuf", "  ", "null"]);

    expect(found.map(({ query }) => query)).toEqual(["oeuf"]);
    expect(runQuery).toHaveBeenCalledTimes(1);
  });

  it("refuses a list of names that are only spaces or words for nothing, as it refuses an empty one", async () => {
    const { ctx, runQuery } = _ctx({});

    for (const queries of [[], ["   "], ["null", "N/A"]])
      await expect(async () => _search(ctx, queries)).rejects.toThrow();
    expect(runQuery).not.toHaveBeenCalled();
  });
});
