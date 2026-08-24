import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../../../_generated/api";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

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
      defaultUnit: "pcs",
      defaultQuantity: 6,
      nutrition: { calories: 70, protein: 6, fat: 5, carbohydrates: 0 },
      updatedAt: Date.now(),
    });

    return { userId, householdId, ingredientId };
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
});
