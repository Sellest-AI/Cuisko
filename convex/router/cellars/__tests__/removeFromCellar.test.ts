import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";

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
      .filter(([path]) => path.startsWith("/convex/router/cellars/removeFromCellar."))
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

describe("router/cellars/removeFromCellar", () => {
  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    const { householdId, ingredientId } = await seedHousehold(t);

    await expect(
      t.mutation(api.router.cellars.removeFromCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 1 }),
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
        .mutation(api.router.cellars.removeFromCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 1 }),
    ).rejects.toThrow();
  });

  test("throws when no matching cellar item exists", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await expect(
      t
        .withIdentity(asUser(userId))
        .mutation(api.router.cellars.removeFromCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 1 }),
    ).rejects.toThrow();
  });

  test("decrements the quantity on a partial removal, without touching recently-used", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 6, updatedAt: Date.now() }),
    );

    await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.removeFromCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 2 });

    const items = await t.run((ctx) => ctx.db.query("cellarItems").collect());
    expect(items).toHaveLength(1);
    expect(items[0]!.quantity).toBe(4);

    const recentlyUsed = await t.run((ctx) => ctx.db.query("recentlyUsedIngredients").collect());
    expect(recentlyUsed).toHaveLength(0);

    const groceryList = await t.run((ctx) => ctx.db.query("groceryListItems").collect());
    expect(groceryList).toHaveLength(0);
  });

  test("emptying the row deletes it and records it as recently used", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 4, updatedAt: Date.now() }),
    );

    await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.removeFromCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 4 });

    const items = await t.run((ctx) => ctx.db.query("cellarItems").collect());
    expect(items).toHaveLength(0);

    const recentlyUsed = await t.run((ctx) => ctx.db.query("recentlyUsedIngredients").collect());
    expect(recentlyUsed).toHaveLength(1);
    expect(recentlyUsed[0]!.quantity).toBe(4);
  });

  /**
   * The defect the five-minute rule caused, pinned: stock the shopper bought seconds ago and
   * nobody had asked for used to come back as a grocery line they never wrote.
   */
  test("a removal with no restoreToList leaves nothing on the grocery list, however fresh the row", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 4, updatedAt: Date.now() }),
    );

    await t
      .withIdentity(asUser(userId))
      .mutation(api.router.cellars.removeFromCellar.authed, { householdId, ingredientId, unit: "pcs", quantity: 4 });

    const groceryList = await t.run((ctx) => ctx.db.query("groceryListItems").collect());
    expect(groceryList).toHaveLength(0);
  });

  test("restores exactly the quantity the caller asked for, not the whole removal", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 9, updatedAt: Date.now() }),
    );

    await t.withIdentity(asUser(userId)).mutation(api.router.cellars.removeFromCellar.authed, {
      householdId,
      ingredientId,
      unit: "pcs",
      quantity: 9,
      restoreToList: 3,
    });

    const groceryList = await t.run((ctx) => ctx.db.query("groceryListItems").collect());
    expect(groceryList).toHaveLength(1);
    expect(groceryList[0]!.quantity).toBe(3);
  });

  test("an undo is not running out — restoring suppresses the recently-used entry", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 4, updatedAt: Date.now() }),
    );

    await t.withIdentity(asUser(userId)).mutation(api.router.cellars.removeFromCellar.authed, {
      householdId,
      ingredientId,
      unit: "pcs",
      quantity: 4,
      restoreToList: 4,
    });

    const recentlyUsed = await t.run((ctx) => ctx.db.query("recentlyUsedIngredients").collect());
    expect(recentlyUsed).toHaveLength(0);
  });

  test("restores on a partial removal too, leaving the rest on the shelf", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 10, updatedAt: Date.now() }),
    );

    await t.withIdentity(asUser(userId)).mutation(api.router.cellars.removeFromCellar.authed, {
      householdId,
      ingredientId,
      unit: "pcs",
      quantity: 4,
      restoreToList: 4,
    });

    const items = await t.run((ctx) => ctx.db.query("cellarItems").collect());
    expect(items[0]!.quantity).toBe(6);

    const groceryList = await t.run((ctx) => ctx.db.query("groceryListItems").collect());
    expect(groceryList).toHaveLength(1);
    expect(groceryList[0]!.quantity).toBe(4);
  });

  test("merges what it restores into the line already carrying that ingredient", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 4, updatedAt: Date.now() });
      await ctx.db.insert("groceryListItems", { householdId, ingredientId, unit: "pcs", quantity: 2, updatedAt: Date.now() });
    });

    await t.withIdentity(asUser(userId)).mutation(api.router.cellars.removeFromCellar.authed, {
      householdId,
      ingredientId,
      unit: "pcs",
      quantity: 4,
      restoreToList: 4,
    });

    const groceryList = await t.run((ctx) => ctx.db.query("groceryListItems").collect());
    expect(groceryList).toHaveLength(1);
    expect(groceryList[0]!.quantity).toBe(6);
  });

  test("treats restoreToList: 0 as no restore at all", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);

    await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId, ingredientId, unit: "pcs", quantity: 4, updatedAt: Date.now() }),
    );

    await t.withIdentity(asUser(userId)).mutation(api.router.cellars.removeFromCellar.authed, {
      householdId,
      ingredientId,
      unit: "pcs",
      quantity: 4,
      restoreToList: 0,
    });

    const groceryList = await t.run((ctx) => ctx.db.query("groceryListItems").collect());
    expect(groceryList).toHaveLength(0);

    const recentlyUsed = await t.run((ctx) => ctx.db.query("recentlyUsedIngredients").collect());
    expect(recentlyUsed).toHaveLength(1);
  });
});
