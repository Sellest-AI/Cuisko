import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Doc, Id } from "@convex/_generated/dataModel";
import type { Tag } from "@shared/tags";

import schema from "../../../schema";
import { refreshRecipe } from "../refreshRecipe";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

const seedIngredient = (
  en: string,
  { diet, allergens = [] }: { diet?: Doc<"ingredients">["diet"]; allergens?: Doc<"ingredients">["allergens"] } = {},
) =>
  t.run((ctx) =>
    ctx.db.insert("ingredients", {
      name: { values: { fr: en, en }, meta: {} },
      search: { fr: en, en },
      category: "OTHER",
      emoji: "🥕",
      ...(diet && { diet }),
      allergens,
      defaultUnit: "pcs",
      defaultQuantity: 1,
      nutrition: { calories: 10, protein: 1, fat: 1, carbohydrates: 1 },
      updatedAt: Date.now(),
    }),
  );

const seedRecipe = (tags: Tag[], search = { fr: "vieux", en: "old" }) =>
  t.run((ctx) =>
    ctx.db.insert("recipes", {
      status: "generated",
      isArchived: false,
      title: { values: { fr: "Soupe", en: "Soup" }, meta: {} },
      description: { values: { fr: "Une soupe.", en: "A soup." }, meta: {} },
      instructions: { values: { fr: "Cuire.", en: "Cook." }, meta: {} },
      servings: 4,
      equipments: [],
      difficulty: 2,
      tags,
      cuisine: "french",
      timings: {},
      search,
      isVegan: tags.includes("vegan"),
      isVegetarian: tags.includes("vegetarian"),
      isPescatarian: false,
      isGlutenFree: false,
      isDairyFree: false,
      isNutFree: false,
      updatedAt: 1,
    }),
  );

const seedLine = (recipeId: Id<"recipes">, ingredientId: Id<"ingredients">, position: number) =>
  t.run((ctx) =>
    ctx.db.insert("recipeIngredients", { recipeId, ingredientId, position, quantity: 1, unit: "pcs", updatedAt: 1 }),
  );

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

    expect(result).toEqual({ refreshed: false, whole: false });
    expect(after.tags).toEqual(["main"]);
    expect(after.search).toEqual(before.search);
    expect(after.updatedAt).toBe(before.updatedAt);
  });

  test("a second refresh in a row writes nothing", async () => {
    const onion = await seedIngredient("onion", { diet: "vegan" });
    const recipeId = await seedRecipe(["soup"]);
    await seedLine(recipeId, onion, 0);

    expect(await refresh(recipeId)).toEqual({ refreshed: true, whole: true });
    const first = (await row(recipeId))!;

    expect(await refresh(recipeId)).toEqual({ refreshed: false, whole: true });
    expect((await row(recipeId))!.updatedAt).toBe(first.updatedAt);
  });
});
