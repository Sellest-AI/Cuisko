import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test, vi } from "vitest";

import { insertTestRecipe } from "@convex/functions/recipes/__tests__/recipes.fixtures";

import type { Id } from "../../../_generated/dataModel";
import { api } from "../../../_generated/api";
import schema from "../../../schema";

const capture = vi.hoisted(() => vi.fn());
vi.mock("@convex/lib/posthog/client", () => ({ posthog: { capture } }));

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
      .filter(([path]) => path.startsWith("/convex/router/cellars/removeFromGroceryList."))
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

    return { userId, householdId, ingredientId };
  });

/** The scaffolding a ledger claim hangs off: one plan, one plate on it, from a one-recipe library. */
const seedPlate = (t: ReturnType<typeof convexTest>, householdId: Id<"households">) =>
  t.run(async (ctx) => {
    const recipeId = await insertTestRecipe(ctx.db, {
      timings: { cooking: 20 },
      shuffleKey: 0.5,
      isVegan: true,
      isVegetarian: true,
      isPescatarian: true,
      isGlutenFree: true,
      isDairyFree: true,
      isNutFree: true,
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

describe("router/cellars/removeFromGroceryList", () => {
  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    const { householdId, ingredientId } = await seedHousehold(t);

    await expect(
      t.mutation(api.router.cellars.removeFromGroceryList.authed, { householdId, ingredientId, unit: "pcs" }),
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
      t
        .withIdentity(asUser(outsiderId))
        .mutation(api.router.cellars.removeFromGroceryList.authed, { householdId, ingredientId, unit: "pcs" }),
    ).rejects.toThrow();
  });

  test("throws when no matching grocery list item exists", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await expect(
      t
        .withIdentity(asUser(userId))
        .mutation(api.router.cellars.removeFromGroceryList.authed, { householdId, ingredientId, unit: "pcs" }),
    ).rejects.toThrow();
  });

  test("deletes every matching-unit item, leaving other units and households untouched", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("groceryListItems", {
        householdId,
        ingredientId,
        unit: "pcs",
        quantity: 4,
        updatedAt: Date.now(),
      });
      await ctx.db.insert("groceryListItems", {
        householdId,
        ingredientId,
        unit: "pcs",
        quantity: 2,
        updatedAt: Date.now(),
      });
      await ctx.db.insert("groceryListItems", {
        householdId,
        ingredientId,
        unit: "kg",
        quantity: 1,
        updatedAt: Date.now(),
      });
    });

    await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.removeFromGroceryList.authed, { householdId, ingredientId, unit: "pcs" });

    const remaining = await t.run((ctx) => ctx.db.query("groceryListItems").collect());
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.unit).toBe("kg");
  });

  /**
   * A claim pointing at a struck row loses the pointer with the row instead of naming a ghost —
   * but the claim itself stays struck, and a reservation it held against a cellar lot stands: the
   * shopper overruled the list, and the line still gets cooked.
   */
  test("detaches a plan's claim without touching its reservation", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    const plannedMealId = await seedPlate(t, householdId);
    const { claimId, reservedLotId } = await t.run(async (ctx) => {
      const reservedLotId = await ctx.db.insert("cellarItems", {
        householdId, ingredientId, unit: "pcs", quantity: 250, updatedAt: Date.now(),
      });
      const groceryRowId = await ctx.db.insert("groceryListItems", {
        householdId, ingredientId, unit: "pcs", quantity: 4, updatedAt: Date.now(),
      });
      const claimId = await ctx.db.insert("plannedMealIngredients", {
        plannedMealId,
        ingredientId,
        sourceQuantity: 4,
        sourceUnit: "pcs",
        quantity: 4,
        unit: "pcs",
        groceryQuantity: 4,
        groceryListItemId: groceryRowId,
        cellarItemId: reservedLotId,
        updatedAt: Date.now(),
      });

      return { claimId, reservedLotId };
    });

    await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.removeFromGroceryList.authed, { householdId, ingredientId, unit: "pcs" });

    await t.run(async (ctx) => {
      const groceryList = await ctx.db.query("groceryListItems").collect();
      expect(groceryList).toHaveLength(0);

      const claim = await ctx.db.get(claimId);
      expect(claim).not.toBeNull();
      expect(claim!.groceryListItemId).toBeUndefined();
      expect(claim!.cellarItemId).toBe(reservedLotId);
    });
  });
});

/** A deletion is the only way off the list besides a purchase; how soon after the add tells a mistap. */
describe("router/cellars/removeFromGroceryList reports the removal", () => {
  test("reports the ingredient struck off and how many lines went with it", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("groceryListItems", { householdId, ingredientId, unit: "pcs", quantity: 4, updatedAt: Date.now() });
      await ctx.db.insert("groceryListItems", { householdId, ingredientId, unit: "pcs", quantity: 2, updatedAt: Date.now() });
    });
    capture.mockReset();

    await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.removeFromGroceryList.authed, { householdId, ingredientId, unit: "pcs" });

    expect(capture.mock.calls.map(([, args]) => args)).toEqual([
      {
        distinctId: userId,
        event: "grocery item removed",
        groups: { household: householdId },
        properties: { ingredientId, ingredient: "Egg", category: "EGG", lines: 2 },
      },
    ]);
  });
});
