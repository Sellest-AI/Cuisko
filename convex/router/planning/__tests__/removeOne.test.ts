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
      .filter(([path]) => path.startsWith("/convex/router/planning/removeOne."))
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

/** A recipe of one 200 g line, written for two servings, owned by the catalog when that is left out. */
const seedRecipe = (title: string, userId?: Id<"users">) =>
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
      userId,
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
    await ctx.db.insert("recipeIngredients", {
      recipeId,
      ingredientId,
      position: 0,
      quantity: 200,
      unit: "g",
      updatedAt: Date.now(),
    });
    return { recipeId, ingredientId };
  });

/** A recipe of one pinch of thyme, written for two: a jar is bought once for the week, whatever the plate count. */
const seedPinchRecipe = () =>
  t.run(async (ctx) => {
    const ingredientId = await ctx.db.insert("ingredients", {
      name: { values: { fr: "Thym" }, meta: {} },
      category: "HERB",
      emoji: "🌿",
      defaultUnit: "g",
      defaultQuantity: 20,
      nutrition: { calories: 1, protein: 0, fat: 0, carbohydrates: 0 },
      updatedAt: Date.now(),
    });
    const recipeId = await ctx.db.insert("recipes", {
      title: { values: { fr: "Poulet au thym" }, meta: {} },
      description: { values: { fr: "" }, meta: {} },
      instructions: { values: { fr: "" }, meta: {} },
      servings: 2,
      equipments: [],
      difficulty: 1,
      tags: [],
      cuisine: "french",
      timings: { cooking: 20 },
      search: { en: "", fr: "" },
      shuffleKey: 2_000,
      isVegan: true,
      isVegetarian: true,
      isPescatarian: true,
      isGlutenFree: false,
      isDairyFree: false,
      isNutFree: false,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("recipeIngredients", {
      recipeId,
      ingredientId,
      position: 0,
      quantity: 1,
      unit: "tsp",
      updatedAt: Date.now(),
    });
    return { recipeId, ingredientId };
  });

/**
 * Commits one plate per date and answers the meal ids in eating order, which is the order the week
 * was written in and the order its claims landed on the list.
 */
const commitPlates = async (
  userId: Id<"users">,
  householdId: Id<"households">,
  recipeId: Id<"recipes">,
  dates: number[],
) => {
  const mealPlanId = await t.withIdentity(asUser(userId)).mutation(api.router.planning.commit.authed, {
    householdId,
    people: 2,
    seed: 0.5,
    today: TODAY,
    owned: [],
    plates: dates.map((date) => ({ recipeId, date, slot: "lunch" as const, servings: 2 })),
  });

  return t.run(async (ctx) => {
    const meals = await ctx.db.query("plannedMeals").collect();
    return meals
      .filter((meal) => meal.mealPlanId === mealPlanId)
      .sort((first, second) => first.date - second.date)
      .map((meal) => meal._id);
  });
};

const removeOne = (userId: Id<"users">, householdId: Id<"households">, mealId: Id<"plannedMeals">) =>
  t.withIdentity(asUser(userId)).mutation(api.router.planning.removeOne.authed, { householdId, mealId, today: TODAY });

const listOf = (householdId: Id<"households">) =>
  t.run(async (ctx) => {
    const rows = await ctx.db.query("groceryListItems").collect();
    return rows.filter((row) => row.householdId === householdId);
  });

const ledgerOf = (plannedMealId: Id<"plannedMeals">) =>
  t.run(async (ctx) => {
    const rows = await ctx.db.query("plannedMealIngredients").collect();
    return rows.filter((row) => row.plannedMealId === plannedMealId);
  });

const plansOf = (householdId: Id<"households">) =>
  t.run(async (ctx) => {
    const rows = await ctx.db.query("mealPlans").collect();
    return rows.filter((plan) => plan.householdId === householdId);
  });

describe("router/planning/removeOne", () => {
  test("rejects an unauthenticated caller", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId } = await seedRecipe("Soupe");
    const [mealId] = await commitPlates(userId, householdId, recipeId, [TODAY + DAY]);

    await expect(
      t.mutation(api.router.planning.removeOne.authed, { householdId, mealId, today: TODAY }),
    ).rejects.toThrow();
  });

  test("rejects a caller who is not a member of the household", async () => {
    const { userId, householdId } = await seedMember();
    const outsiderId = await t.run((ctx) => ctx.db.insert("users", { name: "Outsider" }));
    const { recipeId } = await seedRecipe("Soupe");
    const [mealId] = await commitPlates(userId, householdId, recipeId, [TODAY + DAY]);

    await expect(removeOne(outsiderId, householdId, mealId)).rejects.toThrow();
  });

  test("rejects a meal that belongs to another household", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId } = await seedRecipe("Soupe");
    const [mealId] = await commitPlates(userId, householdId, recipeId, [TODAY + DAY]);
    const elsewhere = await seedMember();

    await expect(removeOne(elsewhere.userId, elsewhere.householdId, mealId)).rejects.toThrow();

    const untouched = await ledgerOf(mealId);
    expect(untouched).toHaveLength(1);
  });

  test("takes the meal and its grocery claims with it", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId } = await seedRecipe("Soupe");
    const [mealId] = await commitPlates(userId, householdId, recipeId, [TODAY + DAY]);

    await removeOne(userId, householdId, mealId);

    const remaining = await ledgerOf(mealId);
    expect(remaining).toEqual([]);
    expect(await listOf(householdId)).toEqual([]);
  });

  /** The other plate's line is still on that row, and the plan still describes the run that made them. */
  test("leaves the rest of the week, its claims and the plan row alone", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId } = await seedRecipe("Soupe");
    const [lunchId, dinnerId] = await commitPlates(userId, householdId, recipeId, [TODAY + DAY, TODAY + 2 * DAY]);

    // The cellar holds nothing, so both plates put their 200 g on the same grocery row.
    await removeOne(userId, householdId, lunchId);

    expect(await listOf(householdId)).toMatchObject([{ quantity: 200 }]);
    expect(await ledgerOf(dinnerId)).toHaveLength(1);
    expect(await ledgerOf(lunchId)).toEqual([]);
    expect(await plansOf(householdId)).toHaveLength(1);
  });

  test("deletes the plan row when its last plate goes", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId } = await seedRecipe("Soupe");
    const [mealId] = await commitPlates(userId, householdId, recipeId, [TODAY + DAY]);

    await removeOne(userId, householdId, mealId);

    expect(await plansOf(householdId)).toEqual([]);
  });

  /**
   * A jar is bought once for the week, and every plate after the one that asked for it records its
   * pinch as covered by that jar. The jar has to outlive the plate that happened to ask first, or
   * the later plate reads ready with its thyme bought by nobody — and go when the last plate does.
   */
  test("hands a jar to the next plate that needs it, and gives it back with the last", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId, ingredientId } = await seedPinchRecipe();
    const [firstId, secondId] = await commitPlates(userId, householdId, recipeId, [TODAY + DAY, TODAY + 2 * DAY]);

    expect(await listOf(householdId)).toMatchObject([{ ingredientId, quantity: 20, unit: "g" }]);
    expect(await ledgerOf(firstId!)).toMatchObject([{ groceryQuantity: 20 }]);
    expect((await ledgerOf(secondId!))[0]!.groceryQuantity).toBeUndefined();

    await removeOne(userId, householdId, firstId!);

    const [jar] = await listOf(householdId);
    expect(jar).toMatchObject({ ingredientId, quantity: 20 });
    expect(await ledgerOf(secondId!)).toMatchObject([{ groceryQuantity: 20, groceryListItemId: jar!._id }]);

    await removeOne(userId, householdId, secondId!);

    expect(await listOf(householdId)).toEqual([]);
  });

  test("refuses a plate that has been cooked", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId } = await seedRecipe("Soupe");
    const [mealId] = await commitPlates(userId, householdId, recipeId, [TODAY + DAY]);
    await t.run((ctx) => ctx.db.patch(mealId, { status: "cooked", updatedAt: Date.now() }));

    await expect(removeOne(userId, householdId, mealId)).rejects.toThrow();

    const stillThere = await ledgerOf(mealId);
    expect(stillThere).toHaveLength(1);
  });
});
