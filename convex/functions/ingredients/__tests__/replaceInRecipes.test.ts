import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import { insertTestRecipe } from "@convex/functions/recipes/__tests__/recipes.fixtures";
import type { Doc, Id } from "@convex/_generated/dataModel";

import schema from "../../../schema";
import { replaceInRecipes } from "../replaceInRecipes";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

const seedIngredient = (
  en: string,
  fields: Partial<Pick<Doc<"ingredients">, "source" | "aliases" | "imageId">> = {},
) =>
  t.run((ctx) =>
    ctx.db.insert("ingredients", {
      name: { values: { fr: en, en }, meta: {} },
      search: { fr: en, en },
      category: "OTHER",
      emoji: "🥕",
      diet: "vegan",
      allergens: [],
      defaultUnit: "pcs",
      defaultQuantity: 1,
      nutrition: { calories: 10, protein: 1, fat: 1, carbohydrates: 1 },
      source: "agent",
      ...fields,
      updatedAt: Date.now(),
    }),
  );

const seedRecipe = () =>
  t.run((ctx) =>
    insertTestRecipe(ctx.db, {
      title: { values: { en: "Grilled mackerel" }, meta: {} },
      description: { values: { en: "Fish." }, meta: {} },
      instructions: { values: { en: "Grill." }, meta: {} },
      servings: 4,
      difficulty: 2,
      tags: ["main"],
      updatedAt: 1,
    }),
  );

const seedLine = (
  recipeId: Id<"recipes">,
  ingredientId: Id<"ingredients">,
  position: number,
  quantity = 1,
  unit: Doc<"recipeIngredients">["unit"] = "pcs",
) =>
  t.run((ctx) =>
    ctx.db.insert("recipeIngredients", { recipeId, ingredientId, position, quantity, unit, updatedAt: 1 }),
  );

const replace = (from: Id<"ingredients">, to: Id<"ingredients">, lineIds: Id<"recipeIngredients">[]) =>
  t.run((ctx) => replaceInRecipes(ctx, { from, to, lineIds }));

const get = <T extends "ingredients" | "recipeIngredients" | "recipes">(id: Id<T>) =>
  t.run((ctx) => ctx.db.get(id));

const insertImage = () =>
  t.run((ctx) =>
    ctx.db.insert("images", {
      hasAlpha: false,
      key: "public/stock.webp",
      url: "stock.webp",
      width: 512,
      height: 512,
      size: 1000,
      mimeType: "image/webp",
      tags: ["IMAGE"],
      updatedAt: Date.now(),
    }),
  );

const scheduledDeletions = async () => {
  const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return jobs.map((job) => (job.args[0] as { imageId: Id<"images"> }).imageId);
};

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("replaceInRecipes", () => {
  test("only the named lines move, keeping their quantity and unit, and their recipe is refreshed", async () => {
    // The Grilled Mackerel: black pepper as `4 pcs` (really its bell peppers) and as `0.625 tsp`.
    const pepper = await seedIngredient("black pepper", { source: "seed" });
    const bell = await seedIngredient("bell pepper", { source: "seed" });
    const recipeId = await seedRecipe();
    const peppers = await seedLine(recipeId, pepper, 0, 4, "pcs");
    const seasoning = await seedLine(recipeId, pepper, 1, 0.625, "tsp");

    const outcome = await replace(pepper, bell, [peppers]);

    expect(outcome).toMatchObject({ linesMoved: 1, recipesRefreshed: 1 });
    expect(await get(peppers)).toMatchObject({ ingredientId: bell, position: 0, quantity: 4, unit: "pcs" });
    expect(await get(seasoning)).toMatchObject({ ingredientId: pepper, quantity: 0.625, unit: "tsp" });
    expect((await get(recipeId))!.search.en).toContain("bell");
  });

  test("a recipe missing a line is reported as skipped, not as refreshed", async () => {
    // Katsudon: position 1 was dropped at import, so the refresh leaves the recipe untouched.
    const stock = await seedIngredient("stock", { source: "seed" });
    const dashi = await seedIngredient("dashi", { source: "seed" });
    const recipeId = await seedRecipe();
    const line = await seedLine(recipeId, stock, 0, 150, "ml");
    await seedLine(recipeId, dashi, 2);

    const outcome = await replace(stock, dashi, [line]);

    expect(outcome).toMatchObject({ linesMoved: 1, recipesRefreshed: 0, recipesSkipped: [recipeId] });
  });

  /**
   * The harira: "cumin seeds" had its own row, and repointing it onto cumin put two lines on one
   * food. The refresh folds them, so the recipe has one line fewer, and the report must say so.
   */
  test("a repoint that lands on a food the recipe already holds merges the two, and reports it", async () => {
    const seeds = await seedIngredient("cumin seeds");
    const cumin = await seedIngredient("cumin", { source: "seed" });
    const recipeId = await seedRecipe();
    const seedLineId = await seedLine(recipeId, seeds, 0, 1, "tbsp");
    await seedLine(recipeId, cumin, 1, 2, "tsp");

    const outcome = await replace(seeds, cumin, [seedLineId]);

    expect(outcome).toMatchObject({ linesMoved: 1, recipesWithMergedLines: [recipeId] });
    const lines = await t.run(async (ctx) =>
      (await ctx.db.query("recipeIngredients").collect()).filter((line) => line.recipeId === recipeId),
    );
    expect(lines.map(({ ingredientId, quantity, unit }) => ({ ingredientId, quantity, unit }))).toEqual([
      { ingredientId: cumin, quantity: 5, unit: "tsp" },
    ]);
  });

  test("a line that is not on `from` refuses the whole call, and nothing moves", async () => {
    const tomato = await seedIngredient("tomato");
    const ketchup = await seedIngredient("ketchup");
    const onion = await seedIngredient("onion");
    const recipeId = await seedRecipe();
    const sauce = await seedLine(recipeId, tomato, 0);
    const wrong = await seedLine(recipeId, onion, 1);

    await expect(replace(tomato, ketchup, [sauce, wrong])).rejects.toThrow(/not on/);

    expect((await get(sauce))!.ingredientId).toBe(tomato);
  });

  test("a `from` still referenced elsewhere survives, and the result names the table", async () => {
    const cube = await seedIngredient("chicken stock cube");
    const broth = await seedIngredient("chicken broth");
    const recipeId = await seedRecipe();
    const liquid = await seedLine(recipeId, cube, 0, 300, "ml");
    await seedLine(recipeId, cube, 1, 1, "pcs");

    const outcome = await replace(cube, broth, [liquid]);

    expect(outcome).toMatchObject({ deleted: false, keptBecause: ["recipeIngredients"] });
    expect(await get(cube)).not.toBeNull();
  });

  test("a seeded `from` is never deleted, even with nothing left pointing at it", async () => {
    const tomato = await seedIngredient("tomato", { source: "seed" });
    const ketchup = await seedIngredient("ketchup", { source: "seed" });
    const recipeId = await seedRecipe();
    const line = await seedLine(recipeId, tomato, 0, 2, "tbsp");

    const outcome = await replace(tomato, ketchup, [line]);

    expect(outcome).toMatchObject({ deleted: false, keptBecause: ["seed"] });
    expect(await get(tomato)).not.toBeNull();
  });

  test("a deleted `from` takes its image with it", async () => {
    const imageId = await insertImage();
    const light = await seedIngredient("light chicken stock", { imageId });
    const broth = await seedIngredient("chicken broth", { source: "seed" });
    const recipeId = await seedRecipe();
    const line = await seedLine(recipeId, light, 0, 500, "ml");

    const outcome = await replace(light, broth, [line]);

    expect(outcome).toEqual({ linesMoved: 1, recipesRefreshed: 1, recipesSkipped: [], recipesWithMergedLines: [], deleted: true, keptBecause: [] });
    expect(await get(light)).toBeNull();
    expect(await scheduledDeletions()).toEqual([imageId]);
  });

  test("neither ingredient row is edited: a wrong link is not a synonym", async () => {
    // Replacing tomato with ketchup must not make "tomato" find ketchup.
    const tomato = await seedIngredient("tomato", { source: "seed", aliases: { en: ["tomatoes"] } });
    const ketchup = await seedIngredient("ketchup", { source: "seed", aliases: { en: ["tomato ketchup"] } });
    const recipeId = await seedRecipe();
    const line = await seedLine(recipeId, tomato, 0, 2, "tbsp");
    const before = await Promise.all([get(tomato), get(ketchup)]);

    await replace(tomato, ketchup, [line]);

    expect(await Promise.all([get(tomato), get(ketchup)])).toEqual(before);
  });

  test("a deleted `from` leaves `to` untouched", async () => {
    const light = await seedIngredient("light chicken stock", { aliases: { en: ["light stock"] } });
    const broth = await seedIngredient("chicken broth", { source: "seed" });
    const recipeId = await seedRecipe();
    const line = await seedLine(recipeId, light, 0, 500, "ml");
    const before = await get(broth);

    await replace(light, broth, [line]);

    expect(await get(light)).toBeNull();
    expect(await get(broth)).toEqual(before);
  });
});
