import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import { RESOLVABLE } from "@shared/ingredientMatch";

import schema from "../../../schema";
import { searchWidened } from "../searchWidened";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

/**
 * Two rows, written the way the seed writes them — `search` per locale, aliases per locale. By
 * hand rather than by running the seed so a failure here points at the search and not at the
 * whole catalog.
 */
const seedCatalog = () =>
  t.run(async (ctx) => {
    const carrotId = await ctx.db.insert("ingredients", {
      slug: "carrot",
      name: { values: { en: "Carrot", fr: "Carotte" }, meta: {} },
      emoji: "🥕",
      aliases: { fr: ["carottes"], en: ["carrots"] },
      search: { en: "Carrot carrots", fr: "Carotte carottes" },
      category: "VEGETABLE",
      defaultUnit: "g",
      defaultQuantity: 200,
      nutrition: { calories: 41, protein: 0.9, fat: 0.2, carbohydrates: 10 },
      updatedAt: Date.now(),
    });

    const creamId = await ctx.db.insert("ingredients", {
      slug: "cream",
      name: { values: { en: "Cream", fr: "Crème fraîche" }, meta: {} },
      emoji: "🥛",
      aliases: {},
      search: { en: "Cream", fr: "Crème fraîche Creme fraiche" },
      category: "DAIRY",
      defaultUnit: "ml",
      defaultQuantity: 200,
      nutrition: { calories: 300, protein: 2, fat: 30, carbohydrates: 3 },
      updatedAt: Date.now(),
    });

    return { carrotId, creamId };
  });

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("functions/ingredients/searchWidened", () => {
  /**
   * The failure the whole slice exists for. A search index is per-locale, so a French device
   * searches `search_fr`, where the English spelling is not indexed — and the row is sitting in
   * `search_en` where nobody looked. Before this function, that shopper got nothing and their
   * ingredient was invented as a duplicate `carotte`.
   */
  test("finds a row indexed under the OTHER locale than the caller's", async () => {
    const { carrotId } = await seedCatalog();

    const found = await t.run((ctx) => searchWidened(ctx, { text: "carrot", locale: "fr" }));

    expect(found[0]?.ingredientId).toBe(carrotId);
  });

  test("and the mirror case — French typed on an English device", async () => {
    const { carrotId } = await seedCatalog();

    const found = await t.run((ctx) => searchWidened(ctx, { text: "carotte", locale: "en" }));

    expect(found[0]?.ingredientId).toBe(carrotId);
  });

  /**
   * What comes back is shown to the shopper, so it is named in their language — even when the row
   * was only reachable through the other one.
   */
  test("names the row in the caller's locale, not the one that found it", async () => {
    await seedCatalog();

    const [french] = await t.run((ctx) => searchWidened(ctx, { text: "carrot", locale: "fr" }));
    const [english] = await t.run((ctx) => searchWidened(ctx, { text: "carotte", locale: "en" }));

    expect(french?.name).toBe("Carotte");
    expect(english?.name).toBe("Carrot");
  });

  test("a row found in both indexes is returned once, not twice", async () => {
    await seedCatalog();

    const found = await t.run((ctx) => searchWidened(ctx, { text: "carotte", locale: "fr" }));

    expect(found.filter((it) => it.name === "Carotte")).toHaveLength(1);
  });

  /**
   * The threshold is lower here than anywhere else in the app, and it still has a floor —
   * otherwise the noise the catalog always returns would read as "this already exists" and the
   * genuine miss this action exists to handle would never be reached.
   */
  test("a term the catalog does not hold returns nothing above the floor", async () => {
    await seedCatalog();

    const found = await t.run((ctx) => searchWidened(ctx, { text: "harissa", locale: "fr" }));

    expect(found).toEqual([]);
  });

  test("everything returned clears the floor, best first", async () => {
    await seedCatalog();

    const found = await t.run((ctx) => searchWidened(ctx, { text: "carotte", locale: "fr" }));

    expect(found.length).toBeGreaterThan(0);
    for (const candidate of found) expect(candidate.score).toBeGreaterThanOrEqual(RESOLVABLE);
    expect(found.map((it) => it.score)).toEqual([...found.map((it) => it.score)].sort((a, b) => b - a));
  });

  test("text that reduces to no identifying word asks the index nothing", async () => {
    await seedCatalog();

    expect(await t.run((ctx) => searchWidened(ctx, { text: "  ", locale: "fr" }))).toEqual([]);
    expect(await t.run((ctx) => searchWidened(ctx, { text: "2", locale: "fr" }))).toEqual([]);
  });
});
