import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Doc, Id } from "@convex/_generated/dataModel";
import type { Unit } from "@shared/ingredients";

import schema from "../../../schema";
import type { Need, Stock } from "../selectMeals";
import { syncMealLines, type MealLine } from "../syncMealLines";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

const TODAY = 1_000_000;

beforeEach(() => {
  t = convexTest(schema, modules);
});

const household = () =>
  t.run((ctx) => ctx.db.insert("households", { name: "Home", inviteCode: "ABC", updatedAt: Date.now() }));

type IngredientFacts = {
  defaultUnit?: Unit;
  defaultQuantity?: number;
  category?: Doc<"ingredients">["category"];
  gramsPerPiece?: number;
  gramsPerMl?: number;
};

const ingredient = (facts: IngredientFacts = {}) =>
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

/** One plate to hang a ledger off. What it cooks is irrelevant here — the lines are handed in. */
const plate = (householdId: Id<"households">) =>
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
      startDate: TODAY,
      days: 1,
      slots: ["lunch"],
      people: 2,
      seed: 0,
      updatedAt: Date.now(),
    });

    return ctx.db.insert("plannedMeals", {
      mealPlanId,
      householdId,
      recipeId,
      date: TODAY,
      slot: "lunch",
      servings: 2,
      status: "planned",
      updatedAt: Date.now(),
    });
  });

type LineSpec = { need: Need; owned?: boolean };

/**
 * Runs the writer over `specs`, with `stock` as the cellar's remaining amounts.
 *
 * Everything crosses inside one `t.run`: a `Stock` is a `Map`, and `t.run`'s boundary serializes,
 * which is the same reason `availableStock.test.ts` rebuilds its map from entries.
 */
const sync = (
  householdId: Id<"households">,
  plannedMealId: Id<"plannedMeals">,
  specs: LineSpec[],
  stock: [Id<"ingredients">, number][] = [],
  lots: [Id<"ingredients">, Id<"cellarItems">][] = [],
) =>
  t.run(async (ctx) => {
    const lines: MealLine[] = await Promise.all(
      specs.map(async ({ need, owned = false }) => ({
        need,
        ingredient: (await ctx.db.get(need.ingredientId))!,
        owned,
      })),
    );

    const left: Stock = new Map(stock);
    await syncMealLines(ctx, { householdId, plannedMealId, lines, stock: left, lots: new Map(lots), from: TODAY });

    return [...left];
  });

/**
 * `t.run` hands back a ctx over the GENERIC data model, so `withIndex` has no index to name here and
 * these two filter in memory — see `functions/recipes/__tests__/saveRecipe.test.ts`. Fine over a
 * fixture of three rows, and not a pattern to copy into `functions/`, where S1 still applies.
 */
const ledgerOf = (plannedMealId: Id<"plannedMeals">) =>
  t.run(async (ctx) => {
    const rows = await ctx.db.query("plannedMealIngredients").collect();
    return rows.filter((row) => row.plannedMealId === plannedMealId);
  });

const listOf = (householdId: Id<"households">) =>
  t.run(async (ctx) => {
    const rows = await ctx.db.query("groceryListItems").collect();
    return rows.filter((row) => row.householdId === householdId);
  });

describe("functions/planning/syncMealLines", () => {
  test("buys the whole line and reserves it when the cellar holds none of it", async () => {
    const home = await household();
    const meal = await plate(home);
    const tomato = await ingredient();

    await sync(home, meal, [{ need: { ingredientId: tomato, quantity: 300, unit: "g", kind: "measured", amount: 300 } }]);

    expect(await ledgerOf(meal)).toMatchObject([
      { sourceQuantity: 300, sourceUnit: "g", quantity: 300, unit: "g", groceryQuantity: 300 },
    ]);
    expect(await listOf(home)).toMatchObject([{ ingredientId: tomato, quantity: 300, unit: "g" }]);
  });

  test("buys nothing and names the lot when the cellar covers the line", async () => {
    const home = await household();
    const meal = await plate(home);
    const tomato = await ingredient();
    const lot = await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId: home, ingredientId: tomato, quantity: 500, unit: "g", updatedAt: Date.now() }),
    );

    const left = await sync(
      home,
      meal,
      [{ need: { ingredientId: tomato, quantity: 300, unit: "g", kind: "measured", amount: 300 } }],
      [[tomato, 500]],
      [[tomato, lot]],
    );

    expect(await listOf(home)).toEqual([]);
    expect(await ledgerOf(meal)).toMatchObject([{ quantity: 300, cellarItemId: lot }]);
    // Absent rather than zero: nothing was bought, so there is nothing to give back on a removal.
    expect((await ledgerOf(meal))[0]!.groceryQuantity).toBeUndefined();
    expect(left).toEqual([[tomato, 200]]);
  });

  /** The reservation is the whole requirement; only the part the cellar could not cover is bought. */
  test("reserves the whole line but buys only what the cellar is short of", async () => {
    const home = await household();
    const meal = await plate(home);
    const onion = await ingredient({ defaultUnit: "pcs", gramsPerPiece: 150 });

    await sync(
      home,
      meal,
      [{ need: { ingredientId: onion, quantity: 2, unit: "pcs", kind: "measured", amount: 2 } }],
      [[onion, 1]],
    );

    expect(await ledgerOf(meal)).toMatchObject([{ quantity: 2, unit: "pcs", groceryQuantity: 1 }]);
    expect(await listOf(home)).toMatchObject([{ quantity: 1, unit: "pcs" }]);
  });

  /** Shopping happens in the unit the household buys in, so the list reads "1 kg" and not "1000 g". */
  test("shops in the ingredient's own unit rather than in the unit it is reserved in", async () => {
    const home = await household();
    const meal = await plate(home);
    const flour = await ingredient({ defaultUnit: "kg" });

    await sync(home, meal, [{ need: { ingredientId: flour, quantity: 500, unit: "g", kind: "measured", amount: 500 } }]);

    expect(await ledgerOf(meal)).toMatchObject([{ quantity: 500, unit: "g", groceryQuantity: 0.5 }]);
    expect(await listOf(home)).toMatchObject([{ quantity: 0.5, unit: "kg" }]);
  });

  test("buys a missing pinch at its own default quantity, not at the amount the recipe asks for", async () => {
    const home = await household();
    const meal = await plate(home);
    const thyme = await ingredient({ category: "HERB", defaultUnit: "g", defaultQuantity: 20 });

    await sync(home, meal, [{ need: { ingredientId: thyme, quantity: 1, unit: "cc", kind: "pinch" } }]);

    expect(await listOf(home)).toMatchObject([{ quantity: 20, unit: "g" }]);
    expect(await ledgerOf(meal)).toMatchObject([
      { sourceQuantity: 1, sourceUnit: "cc", quantity: 0, groceryQuantity: 20 },
    ]);
  });

  /**
   * A jar, not one per plate. The pinch that lands on the list makes the ingredient present, so the
   * plates after it are covered by it — three plates wanting thyme ordered three jars before this.
   */
  test("buys a missing pinch once for the whole week, however many plates ask for it", async () => {
    const home = await household();
    const thyme = await ingredient({ category: "HERB", defaultUnit: "g", defaultQuantity: 20 });
    const need: Need = { ingredientId: thyme, quantity: 1, unit: "cc", kind: "pinch" };
    const stock: [Id<"ingredients">, number][] = [];

    // One `stock` would normally carry across the plates; here each call reads what the last wrote.
    const meals = [await plate(home), await plate(home), await plate(home)];
    let left = stock;
    for (const meal of meals) left = await sync(home, meal, [{ need }], left);

    expect(await listOf(home)).toMatchObject([{ quantity: 20 }]);
    expect(left).toEqual([[thyme, 0]]);
  });

  /** A recipe naming the same pinch twice is one jar too, for the same reason. */
  test("buys a pinch named twice in one meal only once", async () => {
    const home = await household();
    const meal = await plate(home);
    const thyme = await ingredient({ category: "HERB", defaultQuantity: 20 });
    const need: Need = { ingredientId: thyme, quantity: 1, unit: "cc", kind: "pinch" };

    await sync(home, meal, [{ need }, { need }]);

    expect(await listOf(home)).toMatchObject([{ quantity: 20 }]);
    expect((await ledgerOf(meal)).map((row) => row.groceryQuantity)).toEqual([20, undefined]);
  });

  /** A pinch asks whether the ingredient is there, not how much: present at nothing still covers it. */
  test("covers a pinch on presence alone and decrements nothing", async () => {
    const home = await household();
    const meal = await plate(home);
    const thyme = await ingredient({ category: "HERB" });

    const left = await sync(home, meal, [{ need: { ingredientId: thyme, quantity: 1, unit: "cc", kind: "pinch" } }], [[thyme, 0]]);

    expect(await listOf(home)).toEqual([]);
    expect(await ledgerOf(meal)).toMatchObject([{ quantity: 0 }]);
    expect((await ledgerOf(meal))[0]!.groceryQuantity).toBeUndefined();
    expect(left).toEqual([[thyme, 0]]);
  });

  /** Nothing can convert it, so it is bought in the recipe's words and reserves nothing it cannot count. */
  test("buys an unmeasured line in the recipe's own unit and never covers it", async () => {
    const home = await household();
    const meal = await plate(home);
    const chicken = await ingredient({ defaultUnit: "pcs" });

    await sync(home, meal, [{ need: { ingredientId: chicken, quantity: 300, unit: "g", kind: "unmeasured" } }], [[chicken, 4]]);

    expect(await listOf(home)).toMatchObject([{ quantity: 300, unit: "g" }]);
    expect(await ledgerOf(meal)).toMatchObject([{ quantity: 300, unit: "g", groceryQuantity: 300 }]);
  });

  test("buys nothing for a line the shopper says is already in the kitchen, but still reserves it", async () => {
    const home = await household();
    const meal = await plate(home);
    const tomato = await ingredient();

    await sync(home, meal, [
      { need: { ingredientId: tomato, quantity: 300, unit: "g", kind: "measured", amount: 300 }, owned: true },
    ]);

    expect(await listOf(home)).toEqual([]);
    expect(await ledgerOf(meal)).toMatchObject([{ quantity: 300 }]);
    expect((await ledgerOf(meal))[0]!.groceryQuantity).toBeUndefined();
  });

  test("merges into the grocery row an earlier meal already opened", async () => {
    const home = await household();
    const lunch = await plate(home);
    const dinner = await plate(home);
    const tomato = await ingredient();
    const need: Need = { ingredientId: tomato, quantity: 300, unit: "g", kind: "measured", amount: 300 };

    await sync(home, lunch, [{ need }]);
    await sync(home, dinner, [{ need }]);

    expect(await listOf(home)).toMatchObject([{ quantity: 600 }]);
  });

  /** Scores a recipe naming one ingredient twice against what its own first line left behind. */
  test("consumes stock line by line within the same meal", async () => {
    const home = await household();
    const meal = await plate(home);
    const butter = await ingredient();
    const need: Need = { ingredientId: butter, quantity: 100, unit: "g", kind: "measured", amount: 100 };

    const left = await sync(home, meal, [{ need }, { need }], [[butter, 150]]);

    expect(left).toEqual([[butter, 0]]);
    expect((await ledgerOf(meal)).map((row) => row.groceryQuantity)).toEqual([undefined, 50]);
  });

  describe("re-syncing a meal that already has lines", () => {
    test("takes the old contribution back off the list before adding the new one", async () => {
      const home = await household();
      const meal = await plate(home);
      const tomato = await ingredient();

      await sync(home, meal, [{ need: { ingredientId: tomato, quantity: 300, unit: "g", kind: "measured", amount: 300 } }]);
      await sync(home, meal, [{ need: { ingredientId: tomato, quantity: 450, unit: "g", kind: "measured", amount: 450 } }]);

      expect(await listOf(home)).toMatchObject([{ quantity: 450 }]);
      expect(await ledgerOf(meal)).toHaveLength(1);
    });

    test("deletes the grocery row at zero rather than leaving it at nothing", async () => {
      const home = await household();
      const meal = await plate(home);
      const tomato = await ingredient();

      await sync(home, meal, [{ need: { ingredientId: tomato, quantity: 300, unit: "g", kind: "measured", amount: 300 } }]);
      await sync(home, meal, []);

      expect(await listOf(home)).toEqual([]);
      expect(await ledgerOf(meal)).toEqual([]);
    });

    /** Somebody else's line is still on that row, so backing this meal out must not take theirs. */
    test("leaves what another meal put on the same row", async () => {
      const home = await household();
      const lunch = await plate(home);
      const dinner = await plate(home);
      const tomato = await ingredient();
      const need: Need = { ingredientId: tomato, quantity: 300, unit: "g", kind: "measured", amount: 300 };

      await sync(home, lunch, [{ need }]);
      await sync(home, dinner, [{ need }]);
      await sync(home, dinner, []);

      expect(await listOf(home)).toMatchObject([{ quantity: 300 }]);
    });
  });

  /**
   * The list may already hold the ingredient in another unit of the same family — a shopper typed
   * "1 kg" by hand — and the planner's line then merges into that row rather than opening a
   * second. What the ledger records is the share that landed, in the row's unit, so backing the
   * meal out later subtracts a number the row can actually be read in.
   */
  describe("landing on a row held in another unit", () => {
    const list = (householdId: Id<"households">, ingredientId: Id<"ingredients">, unit: Unit, quantity: number) =>
      t.run((ctx) => ctx.db.insert("groceryListItems", { householdId, ingredientId, unit, quantity, updatedAt: Date.now() }));

    test("merges a g plan line into a kg row and records its groceryQuantity in kg", async () => {
      const home = await household();
      const meal = await plate(home);
      const flour = await ingredient({ defaultUnit: "g" });
      await list(home, flour, "kg", 1);

      await sync(home, meal, [{ need: { ingredientId: flour, quantity: 500, unit: "g", kind: "measured", amount: 500 } }]);

      expect(await listOf(home)).toMatchObject([{ unit: "kg", quantity: 1.5 }]);
      expect(await ledgerOf(meal)).toMatchObject([{ quantity: 500, unit: "g", groceryQuantity: 0.5 }]);
    });

    /** The whole point of recording the landed figure: the back-out is exact in the row's unit. */
    test("backing the meal out subtracts the kg figure, leaving what the shopper typed", async () => {
      const home = await household();
      const meal = await plate(home);
      const flour = await ingredient({ defaultUnit: "g" });
      await list(home, flour, "kg", 1);

      await sync(home, meal, [{ need: { ingredientId: flour, quantity: 500, unit: "g", kind: "measured", amount: 500 } }]);
      await sync(home, meal, []);

      expect(await listOf(home)).toMatchObject([{ unit: "kg", quantity: 1 }]);
    });

    /** A jar bought onto a row the shopper opened in kg is a jar in kg, on the list and in the ledger. */
    test("buys a pinch onto an off-default row in that row's unit", async () => {
      const home = await household();
      const meal = await plate(home);
      const thyme = await ingredient({ category: "HERB", defaultUnit: "g", defaultQuantity: 20 });
      await list(home, thyme, "kg", 1);

      await sync(home, meal, [{ need: { ingredientId: thyme, quantity: 1, unit: "cc", kind: "pinch" } }]);

      expect(await listOf(home)).toMatchObject([{ unit: "kg", quantity: 1.02 }]);
      expect(await ledgerOf(meal)).toMatchObject([{ quantity: 0, groceryQuantity: 0.02 }]);
    });

    /** The plan's kg line outranks the shopper's g row: the row moves up, and both numbers move with it. */
    test("moves a g row up to kg when the plan shops in kg", async () => {
      const home = await household();
      const meal = await plate(home);
      const flour = await ingredient({ defaultUnit: "kg" });
      await list(home, flour, "g", 500);

      await sync(home, meal, [{ need: { ingredientId: flour, quantity: 1000, unit: "g", kind: "measured", amount: 1000 } }]);

      expect(await listOf(home)).toMatchObject([{ unit: "kg", quantity: 1.5 }]);
      expect(await ledgerOf(meal)).toMatchObject([{ groceryQuantity: 1 }]);
    });
  });
});
