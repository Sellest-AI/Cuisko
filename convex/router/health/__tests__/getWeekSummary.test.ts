import { convexTest } from "convex-test";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";

import { insertTestRecipe } from "@convex/functions/recipes/__tests__/recipes.fixtures";

import type { Id } from "../../../_generated/dataModel";
import { api } from "../../../_generated/api";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** Imports the module under test before any test is timed — see router/preferences/__tests__/getPlanningSeed.test.ts. */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/health/getWeekSummary."))
      .map(([, load]) => load()),
  ),
);

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TODAY = 1_700_000_000_000;

let t: ReturnType<typeof convexTest>;

beforeEach(() => {
  t = convexTest(schema, modules);
});

const seedMember = () =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Franck" });
    await ctx.db.insert("usersExtended", { userId, role: "USER", updatedAt: Date.now() });
    const householdId = await ctx.db.insert("households", { name: "Home", inviteCode: "ABC123", updatedAt: Date.now() });
    await ctx.db.insert("householdUsers", { householdId, userId });
    return { userId, householdId };
  });

/**
 * A two-serving omelette of 200 g of eggs, every fact measured so it can be graded: 143 kcal per
 * 100 g, so 143 kcal a portion.
 */
const seedRecipe = () =>
  t.run(async (ctx) => {
    const ingredientId = await ctx.db.insert("ingredients", {
      name: { values: { fr: "Œuf", en: "Egg" }, meta: {} },
      category: "EGG",
      emoji: "🥚",
      defaultUnit: "g",
      defaultQuantity: 60,
      nutrition: {
        calories: 143, protein: 12.6, fat: 9.5, carbohydrates: 0.7,
        saturatedFat: 3.1, sugars: 0.4, fiber: 0, sodium: 142, iron: 1.8,
      },
      updatedAt: Date.now(),
    });
    const recipeId = await insertTestRecipe(ctx.db, {
      title: { values: { fr: "Omelette" }, meta: {} },
      timings: { cooking: 10 },
      shuffleKey: 0.5,
      isVegetarian: true,
      isPescatarian: true,
      isGlutenFree: true,
      isDairyFree: true,
      isNutFree: true,
    });
    await ctx.db.insert("recipeIngredients", {
      recipeId, ingredientId, position: 0, quantity: 200, unit: "g", updatedAt: Date.now(),
    });
    return recipeId;
  });

type Plate = { date: number; slot: "lunch" | "dinner"; status: "planned" | "cooked" | "skipped"; updatedAt: number };

const seedPlates = (householdId: Id<"households">, recipeId: Id<"recipes">, plates: Plate[]) =>
  t.run(async (ctx) => {
    const mealPlanId = await ctx.db.insert("mealPlans", {
      householdId, startDate: TODAY, days: 7, slots: ["lunch", "dinner"], people: 2, seed: 0.5, updatedAt: Date.now(),
    });
    for (const plate of plates)
      await ctx.db.insert("plannedMeals", { mealPlanId, householdId, recipeId, servings: 2, ...plate });
  });

describe("router/health/getWeekSummary", () => {
  test("rejects an unauthenticated caller", async () => {
    const { householdId } = await seedMember();

    await expect(
      t.query(api.router.health.getWeekSummary.authed, { householdId, locale: "fr" }),
    ).rejects.toThrow();
  });

  /** Membership is the authorization: the plates belong to the household, not to whoever asks. */
  test("rejects a caller who is not a member of the household", async () => {
    const { householdId } = await seedMember();
    const outsiderId = await t.run((ctx) => ctx.db.insert("users", { name: "Outsider" }));

    await expect(
      t.withIdentity(asUser(outsiderId)).query(api.router.health.getWeekSummary.authed, { householdId, locale: "fr" }),
    ).rejects.toThrow();
  });

  test("summarizes the household's cooked plates and nothing else", async () => {
    const { userId, householdId } = await seedMember();
    const other = await seedMember();
    const recipeId = await seedRecipe();
    await seedPlates(householdId, recipeId, [
      { date: TODAY - DAY, slot: "dinner", status: "cooked", updatedAt: TODAY - DAY + 20 * HOUR },
      { date: TODAY, slot: "lunch", status: "cooked", updatedAt: TODAY + 12 * HOUR },
      { date: TODAY, slot: "dinner", status: "skipped", updatedAt: TODAY + 23 * HOUR },
      { date: TODAY + DAY, slot: "lunch", status: "planned", updatedAt: TODAY },
    ]);
    await seedPlates(other.householdId, recipeId, [
      { date: TODAY + 2 * DAY, slot: "lunch", status: "cooked", updatedAt: TODAY + 2 * DAY + 12 * HOUR },
    ]);

    const summary = await t.withIdentity(asUser(userId)).query(api.router.health.getWeekSummary.authed, {
      householdId, locale: "fr",
    });

    expect(summary.days).toBe(2);
    expect(summary.dishes).toHaveLength(2);
    expect(summary.dishes[0]).toMatchObject({ recipeId, title: "Omelette" });
    expect(summary.caloriesPerPortion).toBeCloseTo(143);
    expect(summary.fastingHours).toBe(16);
    expect(summary.health).toBeGreaterThan(0);
    expect(summary.dishes[0]!.cuiScore).toBe(summary.health);
  });

  test("a household with nothing cooked gets an empty summary", async () => {
    const { userId, householdId } = await seedMember();

    const summary = await t.withIdentity(asUser(userId)).query(api.router.health.getWeekSummary.authed, {
      householdId, locale: "fr",
    });

    expect(summary).toEqual({ days: 0, nutrients: [], recentScores: [], dishes: [] });
  });
});
