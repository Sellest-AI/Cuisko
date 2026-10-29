import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import { insertTestRecipe } from "@convex/functions/recipes/__tests__/recipes.fixtures";
import type { Doc, Id } from "@convex/_generated/dataModel";
import type { Tag } from "@shared/tags";

import schema from "../../../schema";
import { refreshRecipe } from "../refreshRecipe";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

const seedIngredient = (
  en: string,
  {
    diet,
    allergens = [],
    category = "OTHER",
    nutrition = { calories: 10, protein: 1, fat: 1, carbohydrates: 1 },
    gramsPerPiece,
  }: {
    diet?: Doc<"ingredients">["diet"];
    allergens?: Doc<"ingredients">["allergens"];
    category?: Doc<"ingredients">["category"];
    nutrition?: Doc<"ingredients">["nutrition"];
    gramsPerPiece?: number;
  } = {},
) =>
  t.run((ctx) =>
    ctx.db.insert("ingredients", {
      name: { values: { fr: en, en }, meta: {} },
      search: { fr: en, en },
      category,
      emoji: "🥕",
      ...(diet && { diet }),
      allergens,
      defaultUnit: "pcs",
      defaultQuantity: 1,
      ...(gramsPerPiece !== undefined && { gramsPerPiece }),
      nutrition,
      updatedAt: Date.now(),
    }),
  );

const seedRecipe = (tags: Tag[], search = { fr: "vieux", en: "old" }) =>
  t.run((ctx) =>
    insertTestRecipe(ctx.db, {
      title: { values: { fr: "Soupe", en: "Soup" }, meta: {} },
      description: { values: { fr: "Une soupe.", en: "A soup." }, meta: {} },
      instructions: { values: { fr: "Cuire.", en: "Cook." }, meta: {} },
      servings: 4,
      difficulty: 2,
      tags,
      search,
      isVegan: tags.includes("vegan"),
      isVegetarian: tags.includes("vegetarian"),
      updatedAt: 1,
    }),
  );

const seedLine = (
  recipeId: Id<"recipes">,
  ingredientId: Id<"ingredients">,
  position: number,
  {
    quantity = 1,
    unit = "pcs",
    fatUse,
  }: { quantity?: number; unit?: Doc<"recipeIngredients">["unit"]; fatUse?: Doc<"recipeIngredients">["fatUse"] } = {},
) =>
  t.run((ctx) =>
    ctx.db.insert("recipeIngredients", {
      recipeId,
      ingredientId,
      position,
      quantity,
      unit,
      ...(fatUse && { fatUse }),
      updatedAt: 1,
    }),
  );

const lines = (recipeId: Id<"recipes">) =>
  t.run(async (ctx) => {
    const rows = await ctx.db.query("recipeIngredients").collect();
    return rows
      .filter((row) => row.recipeId === recipeId)
      .sort((a, b) => a.position - b.position)
      .map(({ ingredientId, position, quantity, unit }) => ({ ingredientId, position, quantity, unit }));
  });

const refresh = (recipeId: Id<"recipes">) => t.run((ctx) => refreshRecipe(ctx, recipeId));

const row = (recipeId: Id<"recipes">) => t.run((ctx) => ctx.db.get(recipeId));

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("refreshRecipe", () => {
  test("the tags somebody chose survive a refresh, ahead of the calculated ones", async () => {
    const onion = await seedIngredient("onion", { diet: "vegan" });
    const recipeId = await seedRecipe(["soup", "comfort-food"]);
    await seedLine(recipeId, onion, 0);

    await refresh(recipeId);

    const { tags } = (await row(recipeId))!;
    expect(tags.slice(0, 2)).toEqual(["soup", "comfort-food"]);
    expect(tags).toContain("vegan");
  });

  test("a calculated tag the lines no longer earn is removed, and its facet follows", async () => {
    const bacon = await seedIngredient("bacon", { diet: "omnivore" });
    const recipeId = await seedRecipe(["soup", "vegan", "vegetarian"]);
    await seedLine(recipeId, bacon, 0);

    await refresh(recipeId);

    const recipe = (await row(recipeId))!;
    expect(recipe.tags).not.toContain("vegan");
    expect(recipe.tags).not.toContain("vegetarian");
    expect(recipe.isVegan).toBe(false);
    expect(recipe.isVegetarian).toBe(false);
  });

  test("a catalog row gaining its diet grants the tag it now earns, and its facet", async () => {
    const leek = await seedIngredient("leek");
    const recipeId = await seedRecipe(["soup"]);
    await seedLine(recipeId, leek, 0);

    await refresh(recipeId);
    expect((await row(recipeId))!.tags).not.toContain("vegan");

    await t.run((ctx) => ctx.db.patch(leek, { diet: "vegan" }));
    await refresh(recipeId);

    const recipe = (await row(recipeId))!;
    expect(recipe.tags).toContain("vegan");
    expect(recipe.isVegan).toBe(true);
  });

  test("search is rebuilt from the linked catalog rows", async () => {
    const ketchup = await seedIngredient("ketchup", { diet: "vegan" });
    const recipeId = await seedRecipe(["main"], { fr: "tomate", en: "tomato" });
    await seedLine(recipeId, ketchup, 0);

    await refresh(recipeId);

    const { search } = (await row(recipeId))!;
    expect(search.en).toContain("ketchup");
    expect(search.en).not.toContain("tomato");
  });

  test("a recipe missing a line (a hole in the numbering) keeps its tags and search untouched", async () => {
    // Katsudon on dev: the pork fillet at position 2 was refused at import, and what is left is
    // pescatarian. Its search still holds "tonkatsu", the only trace of the dropped line.
    const dashi = await seedIngredient("dashi", { diet: "pescatarian" });
    const rice = await seedIngredient("rice", { diet: "vegan" });
    const recipeId = await seedRecipe(["main"], { fr: "tonkatsu", en: "tonkatsu" });
    await seedLine(recipeId, dashi, 0);
    await seedLine(recipeId, rice, 1);
    await seedLine(recipeId, rice, 3);

    const before = (await row(recipeId))!;
    const result = await refresh(recipeId);
    const after = (await row(recipeId))!;

    expect(result).toEqual({ refreshed: false, merged: true, whole: false });
    expect(after.tags).toEqual(["main"]);
    expect(after.search).toEqual(before.search);
    expect(after.updatedAt).toBe(before.updatedAt);
  });

  /** The harira on dev, stored before merging existed: "cumin seeds" and "ground cumin" on one row. */
  test("folds a food stored on two lines into one, and tags the recipe from the merged lines", async () => {
    const cumin = await seedIngredient("cumin", { diet: "vegan" });
    const lentils = await seedIngredient("lentils", { diet: "vegan" });
    const recipeId = await seedRecipe(["soup"]);
    await seedLine(recipeId, cumin, 0, { quantity: 1, unit: "tbsp" });
    await seedLine(recipeId, cumin, 1, { quantity: 2, unit: "tsp" });
    await seedLine(recipeId, lentils, 2, { quantity: 85, unit: "g" });

    expect(await refresh(recipeId)).toEqual({ refreshed: true, merged: true, whole: true });

    expect(await lines(recipeId)).toEqual([
      { ingredientId: cumin, position: 0, quantity: 5, unit: "tsp" },
      { ingredientId: lentils, position: 1, quantity: 85, unit: "g" },
    ]);
    expect((await row(recipeId))!.tags).toContain("vegan");
  });

  /** `replaceInRecipes` is handed line ids from the dashboard; a merge must not invalidate the others. */
  test("keeps the id of every line a merge did not fold away", async () => {
    const cumin = await seedIngredient("cumin", { diet: "vegan" });
    const lentils = await seedIngredient("lentils", { diet: "vegan" });
    const recipeId = await seedRecipe(["soup"]);
    const cuminLines = [
      await seedLine(recipeId, cumin, 0, { quantity: 1, unit: "tbsp" }),
      await seedLine(recipeId, cumin, 1, { quantity: 2, unit: "tsp" }),
    ];
    const lentilLine = await seedLine(recipeId, lentils, 2, { quantity: 85, unit: "g" });

    await refresh(recipeId);

    const stored = await t.run(async (ctx) =>
      (await ctx.db.query("recipeIngredients").collect()).filter((line) => line.recipeId === recipeId),
    );
    expect(stored).toHaveLength(2);
    expect(stored.find((line) => line.ingredientId === lentils)!._id).toBe(lentilLine);
    expect(cuminLines).toContain(stored.find((line) => line.ingredientId === cumin)!._id);
  });

  /** The merge rewrites every line it shifts; the frying oil it moves up must stay tagged. */
  test("keeps the fat use of a line a merge moves", async () => {
    const cumin = await seedIngredient("cumin", { diet: "vegan" });
    const oil = await seedIngredient("oil", { diet: "vegan", category: "OIL" });
    const recipeId = await seedRecipe(["soup"]);
    await seedLine(recipeId, cumin, 0, { quantity: 1, unit: "tbsp" });
    await seedLine(recipeId, cumin, 1, { quantity: 2, unit: "tsp" });
    await seedLine(recipeId, oil, 2, { quantity: 7, unit: "tbsp", fatUse: "fried" });

    await refresh(recipeId);

    const stored = await t.run(async (ctx) =>
      (await ctx.db.query("recipeIngredients").collect()).filter((line) => line.recipeId === recipeId),
    );
    const oilLine = stored.find((line) => line.ingredientId === oil)!;
    expect(oilLine.position).toBe(1);
    expect(oilLine.fatUse).toBe("fried");
  });

  /**
   * The tags are counted on what is eaten, as the figures beside them are: 400 g of deep-frying
   * oil is 884 kcal a serving bought and about 133 eaten.
   */
  test("tags a recipe on the share of its frying oil that is eaten", async () => {
    const oil = await seedIngredient("oil", {
      diet: "vegan",
      category: "OIL",
      nutrition: { calories: 884, protein: 0, fat: 100, carbohydrates: 0 },
      gramsPerPiece: 400,
    });
    const recipeId = await seedRecipe(["main"]);
    await seedLine(recipeId, oil, 0, { fatUse: "deepFried" });

    await refresh(recipeId);

    const { tags } = (await row(recipeId))!;
    expect(tags).not.toContain("high-calorie");
    expect(tags).toContain("low-calorie");
  });

  test("folds the duplicate on a recipe missing a line, and still leaves its tags alone", async () => {
    const dashi = await seedIngredient("dashi", { diet: "pescatarian" });
    const rice = await seedIngredient("rice", { diet: "vegan" });
    const recipeId = await seedRecipe(["main"]);
    await seedLine(recipeId, dashi, 0);
    await seedLine(recipeId, rice, 1);
    await seedLine(recipeId, rice, 3);

    expect(await refresh(recipeId)).toEqual({ refreshed: false, merged: true, whole: false });

    expect((await lines(recipeId)).map(({ position, quantity }) => [position, quantity])).toEqual([
      [0, 1],
      [2, 2],
    ]);
    expect((await row(recipeId))!.tags).toEqual(["main"]);
  });

  test("a second refresh in a row writes nothing", async () => {
    const onion = await seedIngredient("onion", { diet: "vegan" });
    const recipeId = await seedRecipe(["soup"]);
    await seedLine(recipeId, onion, 0);

    expect(await refresh(recipeId)).toEqual({ refreshed: true, merged: false, whole: true });
    const first = (await row(recipeId))!;

    expect(await refresh(recipeId)).toEqual({ refreshed: false, merged: false, whole: true });
    expect((await row(recipeId))!.updatedAt).toBe(first.updatedAt);
  });
});
