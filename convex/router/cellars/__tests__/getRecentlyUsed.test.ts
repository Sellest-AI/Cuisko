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
    await ctx.db.insert("householdUsers", { householdId, userId, updatedAt: Date.now() });

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

describe("router/cellars/getRecentlyUsed", () => {
  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedHousehold(t);

    await expect(
      t.query(api.router.cellars.getRecentlyUsed.authed, { householdId }),
    ).rejects.toThrow();
  });

  test("rejects a caller who is not a member of the household", async () => {
    const t = convexTest(schema, modules);
    const { householdId } = await seedHousehold(t);
    const outsiderId = await t.run((ctx) => ctx.db.insert("users", { name: "Outsider" }));
    await t.run((ctx) =>
      ctx.db.insert("usersExtended", { userId: outsiderId, role: "USER", updatedAt: Date.now() }),
    );

    await expect(
      t.withIdentity(asUser(outsiderId)).query(api.router.cellars.getRecentlyUsed.authed, { householdId }),
    ).rejects.toThrow();
  });

  test("returns only the caller's household recently-used items", async () => {
    const t = convexTest(schema, modules);
    const { userId, householdId, ingredientId } = await seedHousehold(t);
    const otherHouseholdId = await t.run((ctx) =>
      ctx.db.insert("households", { name: "Other", equipments: [], inviteCode: "XYZ789", updatedAt: Date.now() }),
    );

    await t.run(async (ctx) => {
      await ctx.db.insert("recentlyUsedIngredients", {
        householdId,
        ingredientId,
        unit: "pcs",
        quantity: 4,
        updatedAt: Date.now(),
      });
      await ctx.db.insert("recentlyUsedIngredients", {
        householdId: otherHouseholdId,
        ingredientId,
        unit: "pcs",
        quantity: 99,
        updatedAt: Date.now(),
      });
    });

    const items = await t
      .withIdentity(asUser(userId))
      .query(api.router.cellars.getRecentlyUsed.authed, { householdId });

    expect(items).toHaveLength(1);
    expect(items[0]!.quantity).toBe(4);
  });
});
