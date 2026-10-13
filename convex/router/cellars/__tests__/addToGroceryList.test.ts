import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test, vi } from "vitest";

import type { Unit } from "@shared/ingredients";

import { api } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

const capture = vi.hoisted(() => vi.fn());
vi.mock("@convex/lib/posthog/client", () => ({ posthog: { capture } }));

/**
 * Imports the module under test before any test is timed, so the first one is not billed for the
 * backend graph beneath it against Vitest's 5s timeout. See router/ingredients/__tests__/resolve.test.ts
 * for the measurement. Stops at the `.` so a `"use node"` sibling stays out.
 */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/cellars/addToGroceryList."))
      .map(([, load]) => load()),
  ),
);

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

const seedHousehold = async (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Franck", email: "f@example.com" });
    await ctx.db.insert("usersExtended", { userId, role: "USER", updatedAt: Date.now() });
    const householdId = await ctx.db.insert("households", {
      name: "Home",
      equipments: [],
      inviteCode: "ABC123",
      updatedAt: Date.now(),
    });
    await ctx.db.insert("householdUsers", { householdId, userId });

    const ingredientId = await ctx.db.insert("ingredients", {
      name: { values: { en: "Egg" }, meta: {} },
      category: "EGG",
      emoji: "🥚",
      defaultUnit: "pcs",
      defaultQuantity: 6,
      nutrition: { calories: 70, protein: 6, fat: 5, carbohydrates: 0 },
      updatedAt: Date.now(),
    });

    const flourId = await ctx.db.insert("ingredients", {
      name: { values: { en: "Flour" }, meta: {} },
      category: "GRAIN",
      emoji: "🌾",
      defaultUnit: "g",
      defaultQuantity: 1000,
      nutrition: { calories: 364, protein: 10, fat: 1, carbohydrates: 76 },
      updatedAt: Date.now(),
    });

    return { userId, householdId, ingredientId, flourId };
  });

/** The scaffolding a ledger claim hangs off: one plan, one plate on it, from a one-recipe library. */
const seedPlate = (t: ReturnType<typeof convexTest>, householdId: Id<"households">) =>
  t.run(async (ctx) => {
    const recipeId = await ctx.db.insert("recipes", {
      status: "generated",
      isArchived: false,
      title: { values: { fr: "Pain" }, meta: {} },
      description: { values: { fr: "" }, meta: {} },
      instructions: { values: { fr: "" }, meta: {} },
      servings: 2,
      equipments: [],
      difficulty: 1,
      tags: [],
      cuisine: "french",
      timings: { cooking: 20 },
      search: { en: "", fr: "" },
      shuffleKey: 0.5,
      isVegan: true,
      isVegetarian: true,
      isPescatarian: true,
      isGlutenFree: false,
      isDairyFree: true,
      isNutFree: true,
      updatedAt: Date.now(),
    });
    const mealPlanId = await ctx.db.insert("mealPlans", {
      householdId,
      startDate: 0,
      days: 1,
      slots: ["lunch"],
      people: 2,
      seed: 0.5,
      updatedAt: Date.now(),
    });

    return ctx.db.insert("plannedMeals", {
      mealPlanId,
      householdId,
      recipeId,
      date: 0,
      slot: "lunch",
      servings: 2,
      status: "planned",
      updatedAt: Date.now(),
    });
  });

/** A list row as a planner or a shopper left it, in whatever unit they wrote. */
const seedRow = (
  t: ReturnType<typeof convexTest>,
  householdId: Id<"households">,
  ingredientId: Id<"ingredients">,
  unit: Unit,
  quantity: number,
) =>
  t.run((ctx) => ctx.db.insert("groceryListItems", { householdId, ingredientId, unit, quantity, updatedAt: Date.now() }));

describe("router/cellars/addToGroceryList", () => {
  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    const { householdId, ingredientId } = await seedHousehold(t);

    await expect(
      t.mutation(api.router.cellars.addToGroceryList.authed, {
        householdId,
        ingredientId,
        unit: "pcs",
        quantity: 4,
      }),
    ).rejects.toThrow();
  });

  test("rejects a caller who is not a member of the household", async () => {
    const t = convexTest(schema, modules);
    const { householdId, ingredientId } = await seedHousehold(t);
    const outsiderId = await t.run((ctx) => ctx.db.insert("users", { name: "Outsider" }));
    await t.run((ctx) =>
      ctx.db.insert("usersExtended", { userId: outsiderId, role: "USER", updatedAt: Date.now() }),
    );

    await expect(
      t.withIdentity(asUser(outsiderId)).mutation(api.router.cellars.addToGroceryList.authed, {
        householdId,
        ingredientId,
        unit: "pcs",
        quantity: 4,
      }),
    ).rejects.toThrow();
  });

  test("creates a new grocery list item when none matches", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await t.withIdentity(asUser(userId)).mutation(api.router.cellars.addToGroceryList.authed, {
      householdId,
      ingredientId,
      unit: "pcs",
      quantity: 4,
    });

    const items = await t.run((ctx) => ctx.db.query("groceryListItems").collect());
    expect(items).toHaveLength(1);
    expect(items[0]!.quantity).toBe(4);
  });

  /** A planned week's lines are counted on `week planned` (commit.test.ts); this is the cook's own. */
  test("reports the item the cook added by hand", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);
    capture.mockReset();

    const landed = await t.withIdentity(asUser(userId)).mutation(api.router.cellars.addToGroceryList.authed, {
      householdId,
      ingredientId,
      unit: "pcs",
      quantity: 4,
    });

    expect(capture.mock.calls.map(([, args]) => args)).toEqual([
      {
        distinctId: userId,
        event: "grocery item added",
        groups: { household: householdId },
        properties: { groceryListItemId: landed.id, ingredientId, ingredient: "Egg", category: "EGG" },
      },
    ]);
  });

  test("merges into an existing item of the same ingredient and unit instead of duplicating", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await t.run((ctx) =>
      ctx.db.insert("groceryListItems", {
        householdId,
        ingredientId,
        unit: "pcs",
        quantity: 3,
        updatedAt: Date.now(),
      }),
    );

    await t.withIdentity(asUser(userId)).mutation(api.router.cellars.addToGroceryList.authed, {
      householdId,
      ingredientId,
      unit: "pcs",
      quantity: 4,
    });

    const items = await t.run((ctx) => ctx.db.query("groceryListItems").collect());
    expect(items).toHaveLength(1);
    expect(items[0]!.quantity).toBe(7);
  });

  test("clears the matching recently-used entry once the ingredient is back on the list", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await t.run((ctx) =>
      ctx.db.insert("recentlyUsedIngredients", {
        householdId,
        ingredientId,
        unit: "pcs",
        quantity: 2,
        updatedAt: Date.now(),
      }),
    );

    await t.withIdentity(asUser(userId)).mutation(api.router.cellars.addToGroceryList.authed, {
      householdId,
      ingredientId,
      unit: "pcs",
      quantity: 4,
    });

    const recentlyUsed = await t.run((ctx) => ctx.db.query("recentlyUsedIngredients").collect());
    expect(recentlyUsed).toHaveLength(0);
  });

  /**
   * The case above takes the insert path. This one takes the merge path, which used to return
   * before the cleanup ran — so an ingredient already on the list kept its recently-used row and
   * went on being offered as something the household had run out of.
   */
  test("clears the recently-used entry even when the line already existed", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("groceryListItems", {
        householdId,
        ingredientId,
        unit: "pcs",
        quantity: 3,
        updatedAt: Date.now(),
      });
      await ctx.db.insert("recentlyUsedIngredients", {
        householdId,
        ingredientId,
        unit: "pcs",
        quantity: 2,
        updatedAt: Date.now(),
      });
    });

    await t.withIdentity(asUser(userId)).mutation(api.router.cellars.addToGroceryList.authed, {
      householdId,
      ingredientId,
      unit: "pcs",
      quantity: 4,
    });

    const recentlyUsed = await t.run((ctx) => ctx.db.query("recentlyUsedIngredients").collect());
    expect(recentlyUsed).toHaveLength(0);
  });

  /**
   * One tile per food, whatever unit each hand wrote it in. The planner writes in `defaultUnit`,
   * a shopper types whatever they think in, and an undo restores in the cellar row's unit — and
   * the shop is no place to add 500 g to 1 kg by eye.
   */
  describe("merging across units of one family", () => {
    const add = (
      t: ReturnType<typeof convexTest>,
      userId: Id<"users">,
      householdId: Id<"households">,
      ingredientId: Id<"ingredients">,
      unit: Unit,
      quantity: number,
    ) =>
      t.withIdentity(asUser(userId)).mutation(api.router.cellars.addToGroceryList.authed, {
        householdId,
        ingredientId,
        unit,
        quantity,
      });

    const rowsOf = (t: ReturnType<typeof convexTest>) => t.run((ctx) => ctx.db.query("groceryListItems").collect());

    /** The smaller unit folds into the bigger one, and the row keeps the unit it had. */
    test("g onto a kg row merges into kg and leaves the row in kg", async () => {
      const t = convexTest(schema, modules);
      const { userId, householdId, flourId } = await seedHousehold(t);
      await seedRow(t, householdId, flourId, "kg", 1);

      await add(t, userId, householdId, flourId, "g", 500);

      expect(await rowsOf(t)).toMatchObject([{ unit: "kg", quantity: 1.5 }]);
    });

    /** The one from the bug report: 500 g on the list, 1 kg typed, one tile reading 1.5 kg. */
    test("kg onto a g row moves the row up to kg", async () => {
      const t = convexTest(schema, modules);
      const { userId, householdId, flourId } = await seedHousehold(t);
      await seedRow(t, householdId, flourId, "g", 500);

      await add(t, userId, householdId, flourId, "kg", 1);

      expect(await rowsOf(t)).toMatchObject([{ unit: "kg", quantity: 1.5 }]);
    });

    /**
     * A claim's groceryQuantity is in the unit of the row it names, so a row that changes unit
     * has to take its claims with it — or dropping that meal later strikes 500 kg off a 1.5 kg row.
     */
    test("moving a row up rewrites its claims' groceryQuantity by the same ratio", async () => {
      const t = convexTest(schema, modules);
      const { userId, householdId, flourId } = await seedHousehold(t);
      const rowId = await seedRow(t, householdId, flourId, "g", 500);
      const plannedMealId = await seedPlate(t, householdId);
      const claimId = await t.run((ctx) =>
        ctx.db.insert("plannedMealIngredients", {
          plannedMealId,
          ingredientId: flourId,
          sourceQuantity: 500,
          sourceUnit: "g",
          quantity: 500,
          unit: "g",
          groceryQuantity: 500,
          groceryListItemId: rowId,
          owned: false,
          updatedAt: Date.now(),
        }),
      );

      await add(t, userId, householdId, flourId, "kg", 1);

      const claim = await t.run((ctx) => ctx.db.get(claimId));
      expect(claim).toMatchObject({ groceryListItemId: rowId, groceryQuantity: 0.5 });
    });

    test("ml onto an l row merges into l", async () => {
      const t = convexTest(schema, modules);
      const { userId, householdId, flourId } = await seedHousehold(t);
      await seedRow(t, householdId, flourId, "l", 1);

      await add(t, userId, householdId, flourId, "ml", 250);

      expect(await rowsOf(t)).toMatchObject([{ unit: "l", quantity: 1.25 }]);
    });

    /** Imperial shops by the same ladder: an ounce is 28.35 g whatever it weighs. */
    test("oz onto a g row merges into oz, the bigger of the two", async () => {
      const t = convexTest(schema, modules);
      const { userId, householdId, flourId } = await seedHousehold(t);
      await seedRow(t, householdId, flourId, "g", 100);

      await add(t, userId, householdId, flourId, "oz", 1);

      const [row] = await rowsOf(t);
      expect(row!.unit).toBe("oz");
      expect(row!.quantity).toBeCloseTo(1 + 100 / 28.349523125, 6);
    });

    /** Three eggs and 200 g of egg are not the same line: pieces have no ratio to anything. */
    test("pcs never merges with a mass row", async () => {
      const t = convexTest(schema, modules);
      const { userId, householdId, flourId } = await seedHousehold(t);
      await seedRow(t, householdId, flourId, "g", 200);

      await add(t, userId, householdId, flourId, "pcs", 3);

      expect(await rowsOf(t)).toHaveLength(2);
    });

    test("a mass row never merges with a volume row", async () => {
      const t = convexTest(schema, modules);
      const { userId, householdId, flourId } = await seedHousehold(t);
      await seedRow(t, householdId, flourId, "g", 200);

      await add(t, userId, householdId, flourId, "ml", 200);

      expect(await rowsOf(t)).toHaveLength(2);
    });

    /** Spoons are cooking measures: the maths could merge them, the product says not to. */
    test("tbsp and tsp keep their own rows next to a volume row", async () => {
      const t = convexTest(schema, modules);
      const { userId, householdId, flourId } = await seedHousehold(t);
      await seedRow(t, householdId, flourId, "ml", 200);

      await add(t, userId, householdId, flourId, "tbsp", 2);
      await add(t, userId, householdId, flourId, "tsp", 1);

      expect(await rowsOf(t)).toHaveLength(3);
    });

    test("opens a row of its own when nothing of the family is on the list", async () => {
      const t = convexTest(schema, modules);
      const { userId, householdId, flourId } = await seedHousehold(t);

      await add(t, userId, householdId, flourId, "kg", 1);

      expect(await rowsOf(t)).toMatchObject([{ unit: "kg", quantity: 1 }]);
    });

    /**
     * Recently-used is cleared on the insert and same-unit paths already; the cross-unit paths are
     * new, and an ingredient back on the list must not go on being offered as run out.
     */
    test("clears the recently-used entry on a cross-unit merge too", async () => {
      const t = convexTest(schema, modules);
      const { userId, householdId, flourId } = await seedHousehold(t);
      await seedRow(t, householdId, flourId, "g", 500);
      await t.run((ctx) =>
        ctx.db.insert("recentlyUsedIngredients", { householdId, ingredientId: flourId, unit: "kg", quantity: 1, updatedAt: Date.now() }),
      );

      await add(t, userId, householdId, flourId, "kg", 1);

      expect(await t.run((ctx) => ctx.db.query("recentlyUsedIngredients").collect())).toHaveLength(0);
    });
  });
});
