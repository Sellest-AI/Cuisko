import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";

import type { Id } from "../../../_generated/dataModel";
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
      .filter(([path]) => path.startsWith("/convex/router/cellars/addToCellar."))
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
    const recipeId = await ctx.db.insert("recipes", {
      title: { values: { fr: "Soupe" }, meta: {} },
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
      isGlutenFree: true,
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

describe("router/cellars/addToCellar", () => {
  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    const { householdId, ingredientId } = await seedHousehold(t);

    await expect(
      t.mutation(api.router.cellars.addToCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 4 }),
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
        .mutation(api.router.cellars.addToCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 4 }),
    ).rejects.toThrow();
  });

  test("creates a new cellar item when none matches", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    const id = await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.addToCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 4 });

    const items = await t.run((ctx) => ctx.db.query("cellarItems").collect());
    expect(items).toHaveLength(1);
    expect(items[0]!._id).toBe(id);
    expect(items[0]!.quantity).toBe(4);
  });

  test("merges into an existing item of the same ingredient and unit instead of duplicating", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 3, updatedAt: Date.now() }),
    );

    await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.addToCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 4 });

    const items = await t.run((ctx) => ctx.db.query("cellarItems").collect());
    expect(items).toHaveLength(1);
    expect(items[0]!.quantity).toBe(7);
  });

  test("clears the matching recently-used entry once the ingredient is back in the cellar", async () => {
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

    await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.addToCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 4 });

    const recentlyUsed = await t.run((ctx) => ctx.db.query("recentlyUsedIngredients").collect());
    expect(recentlyUsed).toHaveLength(0);
  });

  /**
   * The claim the week's commit wrote: 4 eggs missing, bought into the lot the purchase created.
   * The ledger stops naming the list row and names the lot instead — the state the undo reads.
   */
  test("re-anchors a plan's claim when the purchase strikes its grocery row", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    const plannedMealId = await seedPlate(t, householdId);
    const { groceryRowId, claimId } = await t.run(async (ctx) => {
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
        updatedAt: Date.now(),
      });

      return { groceryRowId, claimId };
    });

    const cellarItemId = await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.addToCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 4 });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(groceryRowId)).toBeNull();

      const claim = await ctx.db.get(claimId);
      expect(claim!.groceryListItemId).toBeUndefined();
      expect(claim!.cellarItemId).toBe(cellarItemId);
      expect(claim!.groceryQuantity).toBe(4);
    });
  });

  /**
   * The claim reserved against the first lot at commit time; the purchase merges into a second
   * lot that already existed. The reservation stands — the purchase only settles the missing part.
   */
  test("keeps a claim's own reservation when the purchase lands on another lot", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    const plannedMealId = await seedPlate(t, householdId);
    const { claimId, reservedLotId } = await t.run(async (ctx) => {
      // Inserted first, so the purchase merges into it; the claim's reservation is the other lot.
      await ctx.db.insert("cellarItems", {
        householdId, ingredientId, unit: "pcs", quantity: 1, updatedAt: Date.now(),
      });
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

    const landedOn = await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.addToCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 4 });
    expect(landedOn).not.toBe(reservedLotId);

    await t.run(async (ctx) => {
      const claim = await ctx.db.get(claimId);
      expect(claim!.groceryListItemId).toBeUndefined();
      expect(claim!.cellarItemId).toBe(reservedLotId);

      const boughtLot = await ctx.db.get(landedOn);
      expect(boughtLot!.quantity).toBe(5);
    });
  });

  /** A row only decremented keeps its identity, and with it the claims still pointing at it. */
  test("a row only partly struck keeps the claim's pointer", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    const plannedMealId = await seedPlate(t, householdId);
    const { groceryRowId, claimId } = await t.run(async (ctx) => {
      const groceryRowId = await ctx.db.insert("groceryListItems", {
        householdId, ingredientId, unit: "pcs", quantity: 10, updatedAt: Date.now(),
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
        updatedAt: Date.now(),
      });

      return { groceryRowId, claimId };
    });

    await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.addToCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 4 });

    await t.run(async (ctx) => {
      const claim = await ctx.db.get(claimId);
      expect(claim!.groceryListItemId).toBe(groceryRowId);
      expect(claim!.cellarItemId).toBeUndefined();
    });
  });
});
