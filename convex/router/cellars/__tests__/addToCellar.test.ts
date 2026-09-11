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
});
