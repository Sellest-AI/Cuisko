import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import { insertTestRecipe } from "@convex/functions/recipes/__tests__/recipes.fixtures";
import type { Doc, Id } from "@convex/_generated/dataModel";

import schema from "../../../schema";
import { mergeIngredient } from "../mergeIngredient";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

const seedIngredient = (
  en: string,
  fields: Partial<Pick<Doc<"ingredients">, "source" | "aliases" | "gramsPerPiece" | "gramsPerSlice" | "gramsPerMl">> = {},
) =>
  t.run((ctx) =>
    ctx.db.insert("ingredients", {
      name: { values: { fr: en, en }, meta: {} },
      search: { fr: en, en },
      category: "CONDIMENT",
      emoji: "🌶️",
      diet: "vegan",
      allergens: [],
      defaultUnit: "pcs",
      defaultQuantity: 1,
      nutrition: { calories: 40, protein: 2, fat: 0.4, carbohydrates: 9 },
      source: "agent",
      ...fields,
      updatedAt: Date.now(),
    }),
  );

const seedHousehold = () =>
  t.run((ctx) => ctx.db.insert("households", { name: "Home", inviteCode: "ABC", updatedAt: Date.now() }));

const seedRecipe = () =>
  t.run((ctx) =>
    insertTestRecipe(ctx.db, {
      title: { values: { en: "Chili con carne" }, meta: {} },
      description: { values: { en: "Beans." }, meta: {} },
      instructions: { values: { en: "Simmer." }, meta: {} },
      servings: 4,
      difficulty: 2,
      tags: ["main"],
      cuisine: "mexican",
      updatedAt: 1,
    }),
  );

/**
 * One household's whole hold on `ingredientId`: two chilies in the cellar, one on the list, the
 * planned meal's claim on that list row, the recent shortcut, and the recipe line it came from.
 */
const seedHold = (householdId: Id<"households">, recipeId: Id<"recipes">, ingredientId: Id<"ingredients">) =>
  t.run(async (ctx) => {
    const now = Date.now();
    const lineId = await ctx.db.insert("recipeIngredients", {
      recipeId,
      ingredientId,
      position: 0,
      quantity: 2,
      unit: "pcs",
      updatedAt: 1,
    });
    const cellarItemId = await ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 2, updatedAt: now });
    const groceryListItemId = await ctx.db.insert("groceryListItems", {
      householdId,
      ingredientId,
      unit: "pcs",
      quantity: 1,
      updatedAt: now,
    });
    const recentId = await ctx.db.insert("recentlyUsedIngredients", {
      householdId,
      ingredientId,
      unit: "pcs",
      quantity: 1,
      updatedAt: now,
    });
    const mealPlanId = await ctx.db.insert("mealPlans", {
      householdId,
      startDate: now,
      days: 1,
      slots: ["dinner"],
      people: 2,
      seed: 0,
      updatedAt: now,
    });
    const plannedMealId = await ctx.db.insert("plannedMeals", {
      mealPlanId,
      householdId,
      recipeId,
      date: now,
      slot: "dinner",
      servings: 2,
      status: "planned",
      updatedAt: now,
    });
    const plannedLineId = await ctx.db.insert("plannedMealIngredients", {
      plannedMealId,
      ingredientId,
      sourceQuantity: 1,
      sourceUnit: "pcs",
      quantity: 1,
      unit: "pcs",
      groceryQuantity: 1,
      groceryListItemId,
      updatedAt: now,
    });
    return { lineId, cellarItemId, groceryListItemId, recentId, plannedLineId };
  });

const merge = (from: Id<"ingredients">, to: Id<"ingredients">) => t.run((ctx) => mergeIngredient(ctx, { from, to }));

const get = <T extends "ingredients" | "recipeIngredients" | "cellarItems" | "groceryListItems" | "recentlyUsedIngredients" | "plannedMealIngredients">(
  id: Id<T>,
) => t.run((ctx) => ctx.db.get(id));

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("mergeIngredient", () => {
  /**
   * The case it exists for: an import invented "piment rouge" before `chili-red` was seeded, and a
   * household cooked, stocked and planned with it since.
   */
  test("every row on `from` moves to `to` in place, and `from` is deleted", async () => {
    const invented = await seedIngredient("piment rouge", { gramsPerPiece: 10 });
    const seeded = await seedIngredient("red chili", { source: "seed", gramsPerPiece: 10 });
    const hold = await seedHold(await seedHousehold(), await seedRecipe(), invented);

    const outcome = await merge(invented, seeded);

    expect(outcome).toMatchObject({
      linesMoved: 1,
      cellarItemsMoved: 1,
      groceryListItemsMoved: 1,
      plannedMealIngredientsMoved: 1,
      recentlyUsedMoved: 1,
      recentlyUsedDropped: 0,
      deleted: true,
      keptBecause: [],
    });
    for (const id of [hold.lineId, hold.cellarItemId, hold.groceryListItemId, hold.recentId, hold.plannedLineId]) {
      expect((await get(id))?.ingredientId).toBe(seeded);
    }
    expect(await get(invented)).toBeNull();
  });

  test("a planned line still finds the grocery row it claimed", async () => {
    const invented = await seedIngredient("piment rouge", { gramsPerPiece: 10 });
    const seeded = await seedIngredient("red chili", { source: "seed", gramsPerPiece: 10 });
    const hold = await seedHold(await seedHousehold(), await seedRecipe(), invented);

    await merge(invented, seeded);

    const planned = await get(hold.plannedLineId);
    expect(planned?.groceryListItemId).toBe(hold.groceryListItemId);
    expect((await get(hold.groceryListItemId))?.ingredientId).toBe(seeded);
  });

  test("a household that already had `to` as a shortcut keeps that one, and loses the one on `from`", async () => {
    const invented = await seedIngredient("piment rouge", { gramsPerPiece: 10 });
    const seeded = await seedIngredient("red chili", { source: "seed", gramsPerPiece: 10 });
    const householdId = await seedHousehold();
    const hold = await seedHold(householdId, await seedRecipe(), invented);
    const kept = await t.run((ctx) =>
      ctx.db.insert("recentlyUsedIngredients", { householdId, ingredientId: seeded, unit: "pcs", quantity: 3, updatedAt: Date.now() }),
    );

    const outcome = await merge(invented, seeded);

    expect(outcome).toMatchObject({ recentlyUsedMoved: 0, recentlyUsedDropped: 1, deleted: true });
    expect(await get(hold.recentId)).toBeNull();
    expect(await get(kept)).toMatchObject({ ingredientId: seeded, quantity: 3 });
  });

  /**
   * "sauce sriracha" knew a teaspoon weighs 5.5 g; a seeded row without a density would drop the
   * line out of every total, so the call stops and nothing moves.
   */
  test("a unit `from` could weigh and `to` cannot refuses the whole call", async () => {
    const invented = await seedIngredient("sauce sriracha", { gramsPerMl: 1.1, gramsPerPiece: 10 });
    const seeded = await seedIngredient("sriracha", { source: "seed", gramsPerPiece: 10 });
    const householdId = await seedHousehold();
    const hold = await seedHold(householdId, await seedRecipe(), invented);
    await t.run((ctx) => ctx.db.patch(hold.cellarItemId, { unit: "ml", quantity: 200 }));

    await expect(merge(invented, seeded)).rejects.toThrow(/cannot weigh ml/);

    expect((await get(hold.cellarItemId))?.ingredientId).toBe(invented);
    expect((await get(hold.lineId))?.ingredientId).toBe(invented);
    expect(await get(invented)).not.toBeNull();
  });

  test.each([
    ["a planned line's recipe unit", "plannedLineId", { sourceUnit: "tsp" }, { gramsPerMl: 1.1 }, "tsp"],
    ["a recipe line in slices", "lineId", { unit: "slice" }, { gramsPerSlice: 20 }, "slice"],
  ] as const)("%s `to` cannot weigh refuses the call too", async (_, row, patch, weights, unit) => {
    // "ventre de porc" knew a slice weighs 20 g; a seeded pork belly without one would lose the line.
    const invented = await seedIngredient("ventre de porc", { gramsPerPiece: 10, ...weights });
    const seeded = await seedIngredient("pork belly", { source: "seed", gramsPerPiece: 10 });
    const hold = await seedHold(await seedHousehold(), await seedRecipe(), invented);
    await t.run((ctx) => ctx.db.patch(hold[row], patch));

    await expect(merge(invented, seeded)).rejects.toThrow(new RegExp(`cannot weigh ${unit}`));

    expect((await get(hold[row]))?.ingredientId).toBe(invented);
  });

  /**
   * A duplicate is a synonym, unlike a wrong link: "piments rouges" found the old row, and the
   * next import writing it must find the seeded one rather than invent the duplicate again.
   */
  test("`from`'s name and aliases become aliases of `to`, and `to` is found by them", async () => {
    const invented = await seedIngredient("piment rouge", { gramsPerPiece: 10, aliases: { fr: ["piments rouges", "red chili"] } });
    const seeded = await seedIngredient("red chili", { source: "seed", gramsPerPiece: 10, aliases: { fr: ["piment"] } });
    await seedHold(await seedHousehold(), await seedRecipe(), invented);

    const outcome = await merge(invented, seeded);

    // "red chili" is already `to`'s name, so it is not carried; the fixture names both locales alike.
    expect(outcome.aliasesCarried).toBe(3);
    const row = await get(seeded);
    expect(row?.aliases).toEqual({ fr: ["piment", "piment rouge", "piments rouges"], en: ["piment rouge"] });
    expect(row?.search.fr).toContain("piments rouges");
    expect(row?.search.en).toContain("piment rouge");
  });

  test("a unit neither row could weigh is no reason to refuse", async () => {
    const invented = await seedIngredient("piment rouge");
    const seeded = await seedIngredient("red chili", { source: "seed" });
    await seedHold(await seedHousehold(), await seedRecipe(), invented);

    expect(await merge(invented, seeded)).toMatchObject({ deleted: true });
  });

  test("a seeded `from` hands over its rows and is kept", async () => {
    const seededTwice = await seedIngredient("chili", { source: "seed", gramsPerPiece: 10 });
    const seeded = await seedIngredient("red chili", { source: "seed", gramsPerPiece: 10 });
    const hold = await seedHold(await seedHousehold(), await seedRecipe(), seededTwice);

    const outcome = await merge(seededTwice, seeded);

    expect(outcome).toMatchObject({ deleted: false, keptBecause: ["seed"] });
    expect((await get(hold.cellarItemId))?.ingredientId).toBe(seeded);
  });

  test("refuses to merge a row into itself", async () => {
    const chili = await seedIngredient("red chili", { source: "seed" });

    await expect(merge(chili, chili)).rejects.toThrow(/same ingredient/);
  });
});
