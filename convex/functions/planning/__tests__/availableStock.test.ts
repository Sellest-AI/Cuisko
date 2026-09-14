import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Doc, Id } from "@convex/_generated/dataModel";
import type { Unit } from "@shared/ingredients";

import schema from "../../../schema";
import { availableStock } from "../availableStock";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

const TODAY = 1_000_000;
const DAY = 86_400_000;

const household = () =>
  t.run((ctx) => ctx.db.insert("households", { name: "Home", inviteCode: "ABC", updatedAt: Date.now() }));

const ingredient = (facts: {
  category?: Doc<"ingredients">["category"];
  defaultUnit?: Unit;
  defaultQuantity?: number;
  gramsPerPiece?: number;
  gramsPerMl?: number;
} = {}) =>
  t.run((ctx) =>
    ctx.db.insert("ingredients", {
      name: { values: { fr: "x", en: "x" }, meta: {} },
      category: "VEGETABLE",
      emoji: "🍅",
      defaultUnit: "g",
      defaultQuantity: 500,
      ...facts,
      nutrition: { calories: 10, protein: 1, fat: 1, carbohydrates: 1 },
      updatedAt: Date.now(),
    }),
  );

const cellar = (householdId: Id<"households">, ingredientId: Id<"ingredients">, quantity: number, unit: Unit = "g") =>
  t.run((ctx) =>
    ctx.db.insert("cellarItems", { householdId, ingredientId, quantity, unit, updatedAt: Date.now() }),
  );

/** One planned meal on `date`, reserving `grams` of `ingredientId`; a `groceryQuantity` marks the line bought. */
const reserve = async (
  householdId: Id<"households">,
  ingredientId: Id<"ingredients">,
  grams: number,
  { date = TODAY, status = "planned", groceryQuantity }: {
    date?: number;
    status?: "planned" | "cooked";
    groceryQuantity?: number;
  } = {},
) =>
  t.run(async (ctx) => {
    const recipeId = await ctx.db.insert("recipes", {
      title: { values: { fr: "x" }, meta: {} },
      description: { values: { fr: "x" }, meta: {} },
      instructions: { values: { fr: "x" }, meta: {} },
      servings: 2,
      equipments: [],
      difficulty: 1,
      tags: [],
      cuisine: "french",
      timings: {},
      search: { en: "", fr: "" },
      isVegan: true,
      isVegetarian: true,
      isPescatarian: true,
      isGlutenFree: true,
      isDairyFree: true,
      isNutFree: true,
      updatedAt: Date.now(),
    });
    const mealPlanId = await ctx.db.insert("mealPlans", {
      householdId,
      startDate: date,
      days: 1,
      slots: ["lunch"],
      people: 2,
      seed: 0,
      updatedAt: Date.now(),
    });
    const plannedMealId = await ctx.db.insert("plannedMeals", {
      mealPlanId,
      householdId,
      recipeId,
      date,
      slot: "lunch",
      servings: 2,
      status,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("plannedMealIngredients", {
      plannedMealId,
      ingredientId,
      sourceQuantity: grams,
      sourceUnit: "g",
      quantity: grams,
      unit: "g",
      groceryQuantity,
      updatedAt: Date.now(),
    });
    return plannedMealId;
  });

// `t.run` returns through Convex serialization, which has no Map — so it crosses as entries.
const stockOf = async (householdId: Id<"households">, except?: Id<"plannedMeals">) =>
  new Map(await t.run(async (ctx) => [...(await availableStock(ctx, householdId, TODAY, except))]));

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("functions/planning/availableStock", () => {
  test("sums the cellar in grams", async () => {
    const home = await household();
    const onion = await ingredient({ gramsPerPiece: 150 });
    await cellar(home, onion, 200);
    await cellar(home, onion, 2, "pcs");

    expect((await stockOf(home)).get(onion)).toBe(500);
  });

  /** Milk is bought in millilitres: a litre and a 50 cl bottle add up with no density at all. */
  test("counts an ingredient bought by volume in millilitres", async () => {
    const home = await household();
    const milk = await ingredient({ defaultUnit: "ml" });
    await cellar(home, milk, 1, "l");
    await cellar(home, milk, 50, "cl");

    expect((await stockOf(home)).get(milk)).toBe(1500);
  });

  /** Carrots are bought by the piece: six in the cellar are six, with no piece weight needed. */
  test("counts an ingredient bought by the piece in pieces", async () => {
    const home = await household();
    const carrot = await ingredient({ defaultUnit: "pcs" });
    await cellar(home, carrot, 6, "pcs");

    expect((await stockOf(home)).get(carrot)).toBe(6);
  });

  test("subtracts what a future meal reserves", async () => {
    const home = await household();
    const tomato = await ingredient();
    await cellar(home, tomato, 500);
    await reserve(home, tomato, 300, { date: TODAY + DAY });

    expect((await stockOf(home)).get(tomato)).toBe(200);
  });

  /** The re-scale's pool: a plate being re-portioned does not charge its old lines against its new ones. */
  test("leaves a meal named as except holding its reservations", async () => {
    const home = await household();
    const tomato = await ingredient();
    await cellar(home, tomato, 500);
    const mine = await reserve(home, tomato, 300, { date: TODAY + DAY });
    await reserve(home, tomato, 100, { date: TODAY + 2 * DAY });

    expect((await stockOf(home)).get(tomato)).toBe(100);
    expect((await stockOf(home, mine)).get(tomato)).toBe(400);
  });

  /**
   * A jar bought for one plate covers the pinches after it — the pool says present at nothing, which
   * is what stops a week of pinch plates ordering a jar each. The meal that bought it does not carry
   * its own jar back into its own pool: its re-scale re-runs the whole split, jar and all.
   */
  test("keeps a pinch a planned meal has bought present, but not for the meal that bought it", async () => {
    const home = await household();
    const thyme = await ingredient({ category: "HERB", defaultUnit: "g", defaultQuantity: 20 });
    const buyer = await reserve(home, thyme, 0, { date: TODAY + DAY, groceryQuantity: 20 });
    await reserve(home, thyme, 0, { date: TODAY + 2 * DAY });

    const stock = await stockOf(home);
    expect(stock.has(thyme)).toBe(true);
    expect(stock.get(thyme)).toBe(0);

    expect((await stockOf(home, buyer)).has(thyme)).toBe(false);
  });

  test("lets a past meal reserve nothing", async () => {
    const home = await household();
    const tomato = await ingredient();
    await cellar(home, tomato, 500);
    await reserve(home, tomato, 300, { date: TODAY - DAY });

    expect((await stockOf(home)).get(tomato)).toBe(500);
  });

  test("lets a cooked meal reserve nothing", async () => {
    const home = await household();
    const tomato = await ingredient();
    await cellar(home, tomato, 500);
    await reserve(home, tomato, 300, { status: "cooked" });

    expect((await stockOf(home)).get(tomato)).toBe(500);
  });

  test("floors at zero and keeps the ingredient present when reservations exceed the cellar", async () => {
    const home = await household();
    const tomato = await ingredient();
    await cellar(home, tomato, 100);
    await reserve(home, tomato, 300);

    const stock = await stockOf(home);
    expect(stock.has(tomato)).toBe(true);
    expect(stock.get(tomato)).toBe(0);
  });

  /** Present at 0: a pinch is covered by it, a measured line is not. */
  test("keeps an ingredient whose row cannot reach its stock unit as present, at zero", async () => {
    const home = await household();
    const thyme = await ingredient();
    await cellar(home, thyme, 1, "pcs");

    const stock = await stockOf(home);
    expect(stock.has(thyme)).toBe(true);
    expect(stock.get(thyme)).toBe(0);
  });

  test("reads only the household it was asked about", async () => {
    const home = await household();
    const elsewhere = await household();
    const tomato = await ingredient();
    await cellar(elsewhere, tomato, 500);
    await reserve(elsewhere, tomato, 300);

    expect((await stockOf(home)).size).toBe(0);
  });
});
