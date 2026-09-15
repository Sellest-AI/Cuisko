import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";
import { draftMeal } from "../draftMeal";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

const DAY = 86_400_000;
const TODAY = 1_700_000_000_000;

let t: ReturnType<typeof convexTest>;

beforeEach(() => {
  t = convexTest(schema, modules);
});

const seedHousehold = () =>
  t.run((ctx) => ctx.db.insert("households", { name: "Home", inviteCode: "ABC123", updatedAt: Date.now() }));

const seedUser = () => t.run((ctx) => ctx.db.insert("users", { name: "Stranger" }));

/** A recipe of one 200 g line of its own ingredient, written for two, owned by the catalog when `userId` is left out. */
const seedRecipe = (title: string, userId?: Id<"users">) =>
  t.run(async (ctx) => {
    const ingredientId = await ctx.db.insert("ingredients", {
      name: { values: { fr: title, en: `${title} (en)` }, meta: {} },
      category: "VEGETABLE",
      emoji: "🍅",
      defaultUnit: "g",
      defaultQuantity: 500,
      nutrition: { calories: 10, protein: 1, fat: 1, carbohydrates: 1 },
      updatedAt: Date.now(),
    });
    const recipeId = await ctx.db.insert("recipes", {
      userId,
      title: { values: { fr: title }, meta: {} },
      description: { values: { fr: "" }, meta: {} },
      instructions: { values: { fr: "" }, meta: {} },
      servings: 2,
      equipments: [],
      difficulty: 1,
      tags: [],
      cuisine: "french",
      timings: { cooking: 20 },
      search: { en: "", fr: "" },
      shuffleKey: 1_000,
      isVegan: true,
      isVegetarian: true,
      isPescatarian: true,
      isGlutenFree: false,
      isDairyFree: false,
      isNutFree: false,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("recipeIngredients", {
      recipeId,
      ingredientId,
      position: 0,
      quantity: 200,
      unit: "g",
      updatedAt: Date.now(),
    });
    return { recipeId, ingredientId };
  });

const stock = (householdId: Id<"households">, ingredientId: Id<"ingredients">, quantity: number) =>
  t.run((ctx) => ctx.db.insert("cellarItems", { householdId, ingredientId, quantity, unit: "g", updatedAt: Date.now() }));

const draft = (
  householdId: Id<"households">,
  recipeId: Id<"recipes">,
  { servings = 2, date = TODAY + DAY }: { servings?: number; date?: number } = {},
) =>
  t.run((ctx) => draftMeal(ctx, { householdId, recipeId, locale: "fr", date, slot: "dinner", servings, today: TODAY }));

describe("functions/planning/draftMeal", () => {
  test("shapes the plate the review step draws, in the caller's language", async () => {
    const householdId = await seedHousehold();
    const { recipeId, ingredientId } = await seedRecipe("Soupe");

    const meal = await draft(householdId, recipeId);

    expect(meal).toMatchObject({
      recipeId,
      date: TODAY + DAY,
      slot: "dinner",
      servings: 2,
      title: "Soupe",
      minutes: 20,
      ingredients: [{ ingredientId, name: "Soupe", emoji: "🍅", category: "VEGETABLE", amount: 200, unit: "g" }],
    });
  });

  /** Written for two, cooked for four: the line doubles. */
  test("scales the lines to the plate's servings", async () => {
    const householdId = await seedHousehold();
    const { recipeId } = await seedRecipe("Soupe");

    const meal = await draft(householdId, recipeId, { servings: 4 });

    expect(meal.ingredients[0]).toMatchObject({ amount: 400, unit: "g" });
  });

  test("marks a line covered when the cellar holds enough, and missing when it does not", async () => {
    const householdId = await seedHousehold();
    const { recipeId, ingredientId } = await seedRecipe("Soupe");

    expect((await draft(householdId, recipeId)).ingredients[0]!.covered).toBe(false);

    await stock(householdId, ingredientId, 500);

    expect((await draft(householdId, recipeId)).ingredients[0]!.covered).toBe(true);
    expect((await draft(householdId, recipeId, { servings: 6 })).ingredients[0]!.covered).toBe(false);
  });

  /** The catalog is shared (ADR 0014): another cook's recipe drafts like any other. */
  test("drafts another cook's recipe", async () => {
    const householdId = await seedHousehold();
    const strangerId = await seedUser();
    const { recipeId } = await seedRecipe("Partagée", strangerId);

    expect((await draft(householdId, recipeId)).title).toBe("Partagée");
  });

  test("refuses a recipe that does not exist", async () => {
    const householdId = await seedHousehold();
    const { recipeId } = await seedRecipe("Disparue");
    await t.run((ctx) => ctx.db.delete(recipeId));

    await expect(draft(householdId, recipeId)).rejects.toThrow();
  });

  test("refuses portions outside the plate's range", async () => {
    const householdId = await seedHousehold();
    const { recipeId } = await seedRecipe("Soupe");

    await expect(draft(householdId, recipeId, { servings: 0 })).rejects.toThrow();
    await expect(draft(householdId, recipeId, { servings: 2.5 })).rejects.toThrow();
    await expect(draft(householdId, recipeId, { servings: 99 })).rejects.toThrow();
  });
});
