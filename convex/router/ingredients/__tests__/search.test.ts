import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";

import { api } from "../../../_generated/api";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/**
 * Imports the module under test before any test is timed, so the first one is not billed for the
 * backend graph beneath it against Vitest's 5s timeout. See router/ingredients/__tests__/resolve.test.ts
 * for the measurement. Stops at the `.` so a `"use node"` sibling stays out.
 */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/ingredients/search."))
      .map(([, load]) => load()),
  ),
);

/**
 * Two rows written the way `seedIngredients` writes them — name and aliases flattened into
 * `search`, each also stored accent-stripped. Written by hand rather than by running the seed so
 * a failure here points at the search, not at the 266-row catalog.
 */
const seedCatalog = async (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => {
    const potatoId = await ctx.db.insert("ingredients", {
      slug: "potato",
      name: { values: { en: "Potato", fr: "Pomme de terre" }, meta: {} },
      emoji: "🥔",
      aliases: { fr: ["patates"], en: ["spud"] },
      search: {
        en: "Potato spud",
        fr: "Pomme de terre patates",
      },
      category: "VEGETABLE",
      defaultUnit: "g",
      defaultQuantity: 500,
      nutrition: { calories: 77, protein: 2, fat: 0.1, carbohydrates: 17 },
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

    return { potatoId, creamId };
  });

describe("router/ingredients/search", () => {
  test("returns nothing for a query that is only whitespace", async () => {
    const t = convexTest(schema, modules);
    await seedCatalog(t);

    expect(await t.query(api.router.ingredients.search.anon, { query: "   ", locale: "fr" })).toEqual([]);
  });

  test("finds an ingredient by its name in the caller's locale", async () => {
    const t = convexTest(schema, modules);
    const { potatoId } = await seedCatalog(t);

    const results = await t.query(api.router.ingredients.search.anon, { query: "pomme", locale: "fr" });

    expect(results.map((row) => row._id)).toEqual([potatoId]);
    expect(results.map((row) => row.name)).toEqual(["Pomme de terre"]);
  });

  test("finds an ingredient by an alias — 'patates' reaches pommes de terre", async () => {
    const t = convexTest(schema, modules);
    const { potatoId } = await seedCatalog(t);

    const results = await t.query(api.router.ingredients.search.anon, { query: "patates", locale: "fr" });

    expect(results.map((row) => row._id)).toEqual([potatoId]);
  });

  test("finds an accented ingredient typed without its accents", async () => {
    const t = convexTest(schema, modules);
    const { creamId } = await seedCatalog(t);

    const results = await t.query(api.router.ingredients.search.anon, { query: "creme", locale: "fr" });

    expect(results.map((row) => row._id)).toEqual([creamId]);
  });

  test("searches the index for the caller's locale, not the other one", async () => {
    const t = convexTest(schema, modules);
    await seedCatalog(t);

    // "spud" only exists in the English blob: asking in French must not reach it.
    expect(await t.query(api.router.ingredients.search.anon, { query: "spud", locale: "fr" })).toEqual([]);
    expect(await t.query(api.router.ingredients.search.anon, { query: "spud", locale: "en" })).toHaveLength(1);
  });

  test("does not ship the search blob the index was built from", async () => {
    const t = convexTest(schema, modules);
    await seedCatalog(t);

    const rows = await t.query(api.router.ingredients.search.anon, { query: "pomme", locale: "fr" });

    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("search");
    expect(rows[0]?.emoji).toBe("🥔");
  });

  // The client ranks what comes back, and it cannot rank a synonym it was never told about.
  test("ships the aliases for the caller's locale, and only those", async () => {
    const t = convexTest(schema, modules);
    await seedCatalog(t);

    const [inFrench] = await t.query(api.router.ingredients.search.anon, { query: "pomme", locale: "fr" });
    expect(inFrench?.aliases).toEqual(["patates"]);

    const [inEnglish] = await t.query(api.router.ingredients.search.anon, { query: "potato", locale: "en" });
    expect(inEnglish?.aliases).toEqual(["spud"]);
  });
});
