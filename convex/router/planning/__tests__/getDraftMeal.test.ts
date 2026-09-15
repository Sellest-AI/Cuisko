import { convexTest } from "convex-test";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";

import type { Id } from "../../../_generated/dataModel";
import { api } from "../../../_generated/api";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** Imports the module under test before any test is timed — see commit.test.ts. */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/planning/getDraftMeal."))
      .map(([, load]) => load()),
  ),
);

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

const DAY = 86_400_000;
const TODAY = 1_700_000_000_000;

let t: ReturnType<typeof convexTest>;

beforeEach(() => {
  t = convexTest(schema, modules);
});

const seedUser = () =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Franck" });
    await ctx.db.insert("usersExtended", { userId, role: "USER", updatedAt: Date.now() });
    return userId;
  });

const seedHousehold = () =>
  t.run((ctx) => ctx.db.insert("households", { name: "Home", inviteCode: "ABC123", updatedAt: Date.now() }));

const join = (householdId: Id<"households">, userId: Id<"users">) =>
  t.run((ctx) => ctx.db.insert("householdUsers", { householdId, userId }));

/** A recipe of one 200 g line of its own ingredient, written for two. */
const seedRecipe = (title: string) =>
  t.run(async (ctx) => {
    const ingredientId = await ctx.db.insert("ingredients", {
      name: { values: { fr: title }, meta: {} },
      category: "VEGETABLE",
      emoji: "🍅",
      defaultUnit: "g",
      defaultQuantity: 500,
      nutrition: { calories: 10, protein: 1, fat: 1, carbohydrates: 1 },
      updatedAt: Date.now(),
    });
    const recipeId = await ctx.db.insert("recipes", {
      title: { values: { fr: title }, meta: {} },
      description: { values: { fr: "" }, meta: {} },
      instructions: { values: { fr: "" }, meta: {} },
      servings: 2,
      equipments: [],
      difficulty: 1,
      tags: [],
      cuisine: "french",
      timings: { cooking: 20 },
      search: { en: "", fr: "" },
      shuffleKey: 1_000,
      isVegan: true,
      isVegetarian: true,
      isPescatarian: true,
      isGlutenFree: false,
      isDairyFree: false,
      isNutFree: false,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("recipeIngredients", { recipeId, ingredientId, position: 0, quantity: 200, unit: "g", updatedAt: Date.now() });
    return recipeId;
  });

const args = (householdId: Id<"households">, recipeId: Id<"recipes">) => ({
  householdId, recipeId, date: TODAY + DAY, slot: "lunch" as const, servings: 2, today: TODAY, locale: "fr" as const,
});

describe("router/planning/getDraftMeal", () => {
  test("rejects an unauthenticated caller", async () => {
    const householdId = await seedHousehold();
    const recipeId = await seedRecipe("Soupe");

    await expect(t.query(api.router.planning.getDraftMeal.authed, args(householdId, recipeId))).rejects.toThrow();
  });

  test("rejects a caller who is not a member of the household", async () => {
    const householdId = await seedHousehold();
    const outsiderId = await seedUser();
    const recipeId = await seedRecipe("Soupe");

    await expect(
      t.withIdentity(asUser(outsiderId)).query(api.router.planning.getDraftMeal.authed, args(householdId, recipeId)),
    ).rejects.toThrow();
  });

  test("answers a member with the plate, in their language", async () => {
    const householdId = await seedHousehold();
    const userId = await seedUser();
    await join(householdId, userId);
    const recipeId = await seedRecipe("Soupe");

    const meal = await t
      .withIdentity(asUser(userId))
      .query(api.router.planning.getDraftMeal.authed, args(householdId, recipeId));

    expect(meal).toMatchObject({ recipeId, title: "Soupe", slot: "lunch", servings: 2 });
    expect(meal.ingredients).toHaveLength(1);
  });
});
