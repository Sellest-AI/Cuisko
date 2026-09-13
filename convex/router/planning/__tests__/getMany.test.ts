import { convexTest } from "convex-test";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";

import type { Id } from "../../../_generated/dataModel";
import { api } from "../../../_generated/api";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** Imports the module under test before any test is timed — see router/preferences/__tests__/getPlanningSeed.test.ts. */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/planning/getMany."))
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

const seedMember = () =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Franck" });
    await ctx.db.insert("usersExtended", { userId, role: "USER", updatedAt: Date.now() });
    const householdId = await ctx.db.insert("households", { name: "Home", inviteCode: "ABC123", updatedAt: Date.now() });
    await ctx.db.insert("householdUsers", { householdId, userId });
    return { userId, householdId };
  });

/** A plan holding one plate per date, all of the same catalog recipe. */
const seedPlates = (householdId: Id<"households">, dates: number[]) =>
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
      startDate: dates[0]!,
      days: dates.length,
      slots: ["lunch"],
      people: 2,
      seed: 0.5,
      updatedAt: Date.now(),
    });
    const plateIds: Id<"plannedMeals">[] = [];
    for (const date of dates)
      plateIds.push(await ctx.db.insert("plannedMeals", {
        mealPlanId, householdId, recipeId, date, slot: "lunch", servings: 2, status: "planned", updatedAt: Date.now(),
      }));
    return { recipeId, plateIds };
  });

describe("router/planning/getMany", () => {
  test("rejects an unauthenticated caller", async () => {
    const { householdId } = await seedMember();

    await expect(
      t.query(api.router.planning.getMany.authed, { householdId, locale: "fr", from: TODAY, to: TODAY + DAY }),
    ).rejects.toThrow();
  });

  /** Membership is the authorization: a plan belongs to the household, not to whoever asks. */
  test("rejects a caller who is not a member of the household", async () => {
    const { householdId } = await seedMember();
    const outsiderId = await t.run((ctx) => ctx.db.insert("users", { name: "Outsider" }));

    await expect(
      t.withIdentity(asUser(outsiderId)).query(api.router.planning.getMany.authed, {
        householdId, locale: "fr", from: TODAY, to: TODAY + DAY,
      }),
    ).rejects.toThrow();
  });

  test("answers the plates from `from` up to, not including, `to`", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId } = await seedPlates(householdId, [TODAY - DAY, TODAY, TODAY + DAY, TODAY + 2 * DAY]);

    const meals = await t.withIdentity(asUser(userId)).query(api.router.planning.getMany.authed, {
      householdId, locale: "fr", from: TODAY, to: TODAY + 2 * DAY,
    });

    expect(meals.map((meal) => meal.date)).toEqual([TODAY, TODAY + DAY]);
    expect(meals[0]!.recipe).toMatchObject({ id: recipeId, title: "Soupe" });
  });

  /**
   * A ledger pointer can name a row that is gone — buying detaches it when it settles the claim,
   * and a row a back-out took at zero goes with it. The derive reads the list, not the pointer: a
   * line still naming a listed row is waiting on the shop; a line naming nothing is ready.
   */
  test("derives shopping-needed from lines still on the grocery list, and keeps cooked", async () => {
    const { userId, householdId } = await seedMember();
    const { plateIds: [waiting, bought, cooked] } = await seedPlates(householdId, [TODAY, TODAY + DAY, TODAY + 2 * DAY]);

    await t.run(async (ctx) => {
      const ingredientId = await ctx.db.insert("ingredients", {
        name: { values: { fr: "Tomate" }, meta: {} },
        category: "VEGETABLE",
        emoji: "🍅",
        allergens: [],
        defaultUnit: "g",
        defaultQuantity: 500,
        nutrition: { calories: 10, protein: 1, fat: 1, carbohydrates: 1 },
        updatedAt: Date.now(),
      });
      const onList = await ctx.db.insert("groceryListItems", { householdId, ingredientId, unit: "g", quantity: 200, updatedAt: Date.now() });
      const gone = await ctx.db.insert("groceryListItems", { householdId, ingredientId, unit: "g", quantity: 200, updatedAt: Date.now() });
      await ctx.db.delete(gone);

      const line = { ingredientId, sourceQuantity: 200, sourceUnit: "g" as const, quantity: 200, unit: "g" as const, groceryQuantity: 200, updatedAt: Date.now() };
      await ctx.db.insert("plannedMealIngredients", { ...line, plannedMealId: waiting!, groceryListItemId: onList });
      await ctx.db.insert("plannedMealIngredients", { ...line, plannedMealId: bought!, groceryListItemId: gone });
      await ctx.db.insert("plannedMealIngredients", { ...line, plannedMealId: cooked!, groceryListItemId: onList });
      await ctx.db.patch(cooked!, { status: "cooked" });
    });

    const meals = await t.withIdentity(asUser(userId)).query(api.router.planning.getMany.authed, {
      householdId, locale: "fr", from: TODAY, to: TODAY + 3 * DAY,
    });

    expect(meals.map((meal) => meal.status)).toEqual(["shopping-needed", "ready", "cooked"]);
  });

  test("refuses a range wider than a week", async () => {
    const { userId, householdId } = await seedMember();

    await expect(
      t.withIdentity(asUser(userId)).query(api.router.planning.getMany.authed, {
        householdId, locale: "fr", from: TODAY, to: TODAY + 8 * DAY,
      }),
    ).rejects.toThrow();
  });
});
