import { describe, expect, it, vi } from "vitest";

import { searchIngredientsTool } from "../searchIngredients";

type Ctx = Parameters<ReturnType<typeof searchIngredientsTool>["run"]>[0];

/** A catalog row as `searchCatalog` hands it back, trimmed to what the tool reads. */
const _row = (name: string, weights: { gramsPerPiece?: number; gramsPerMl?: number } = {}) => ({
  _id: `id-${name}`,
  name,
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
});
