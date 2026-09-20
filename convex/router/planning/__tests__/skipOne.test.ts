import { convexTest } from "convex-test";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import type { Id } from "../../../_generated/dataModel";
import { api, internal } from "../../../_generated/api";
import { skipAt } from "../../../functions/planning/skipMeal";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** Imports the module under test before any test is timed — see commit.test.ts. */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/planning/skipOne."))
      .map(([, load]) => load()),
  ),
);

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

const DAY = 86_400_000;
const TODAY = 1_700_000_000_000;

let t: ReturnType<typeof convexTest>;

/**
 * `commit` books a skip job for every plate it writes (`skipAt`), and with `TODAY` in 2023 every
 * one of them is already due: left on a real timer it fires a few ms into the test and closes the
 * plate under the assertion — only under load, and never when the file runs alone. Only the timer
 * functions are faked, so `Date.now()` stays real for the `updatedAt` columns the seeds write, and
 * the pending timers are dropped after each test rather than run; `skipOne.test.ts` runs the job.
 */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  t = convexTest(schema, modules);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

const seedMember = () =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Franck" });
    await ctx.db.insert("usersExtended", { userId, role: "USER", updatedAt: Date.now() });
    const householdId = await ctx.db.insert("households", { name: "Home", inviteCode: "ABC123", updatedAt: Date.now() });
    await ctx.db.insert("householdUsers", { householdId, userId });
    return { userId, householdId };
  });

const seedRecipeOf = (
  title: string,
  line: { quantity: number; unit: "g" | "tsp" },
  ingredient: { category: "VEGETABLE" | "HERB"; defaultQuantity: number },
) =>
  t.run(async (ctx) => {
    const ingredientId = await ctx.db.insert("ingredients", {
      name: { values: { fr: title }, meta: {} },
      category: ingredient.category,
      emoji: "🍅",
      defaultUnit: "g",
      defaultQuantity: ingredient.defaultQuantity,
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
    await ctx.db.insert("recipeIngredients", { recipeId, ingredientId, position: 0, ...line, updatedAt: Date.now() });
    return { recipeId, ingredientId };
  });

/** A recipe of one 200 g line, written for two servings. */
const seedRecipe = () => seedRecipeOf("Soupe", { quantity: 200, unit: "g" }, { category: "VEGETABLE", defaultQuantity: 500 });

/** A recipe of one pinch of thyme — a herb by the spoon — so a jar is bought once for the week, whatever the plate count. */
const seedPinchRecipe = () => seedRecipeOf("Poulet au thym", { quantity: 1, unit: "tsp" }, { category: "HERB", defaultQuantity: 20 });

/** Commits one plate per date and answers the meal ids in eating order. */
const commitPlates = async (userId: Id<"users">, householdId: Id<"households">, recipeId: Id<"recipes">, dates: number[]) => {
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

const skipOne = (mealId: Id<"plannedMeals">) => t.mutation(internal.router.planning.skipOne._internal, { mealId });

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

const plateOf = (mealId: Id<"plannedMeals">) => t.run((ctx) => ctx.db.get(mealId));

const jobsOf = (mealId: Id<"plannedMeals">) =>
  t.run(async (ctx) => {
    const jobs = await ctx.db.system.query("_scheduled_functions").collect();
    return jobs.filter((job) => job.name === "router/planning/skipOne:_internal" && job.args[0]?.mealId === mealId);
  });

describe("router/planning/skipOne", () => {
  /** The bug this lands with: a plate nobody cooked kept asking the list for its groceries forever. */
  test("takes a planned plate's claims off the list, clears its pointers and marks it skipped", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId } = await seedRecipe();
    const [mealId] = await commitPlates(userId, householdId, recipeId, [TODAY + DAY]);

    expect(await listOf(householdId)).toMatchObject([{ quantity: 200 }]);

    await skipOne(mealId!);

    expect(await plateOf(mealId!)).toMatchObject({ status: "skipped" });
    expect(await listOf(householdId)).toEqual([]);

    const [row] = await ledgerOf(mealId!);
    expect(row).toMatchObject({ quantity: 200, unit: "g" });
    expect(row!.groceryQuantity).toBeUndefined();
    expect(row!.groceryListItemId).toBeUndefined();
    expect(row!.cellarItemId).toBeUndefined();
  });

  test("leaves the other plates' claims on a shared row", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId } = await seedRecipe();
    const [firstId, secondId] = await commitPlates(userId, householdId, recipeId, [TODAY + DAY, TODAY + 2 * DAY]);

    await skipOne(firstId!);

    expect(await listOf(householdId)).toMatchObject([{ quantity: 200 }]);
    expect(await ledgerOf(secondId!)).toMatchObject([{ groceryQuantity: 200 }]);
    expect(await plateOf(secondId!)).toMatchObject({ status: "planned" });
  });

  /** A jar bought for the week outlives the plate that happened to ask first — as it does when that plate is dropped. */
  test("hands a jar to the next plate living off it rather than giving it back", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId, ingredientId } = await seedPinchRecipe();
    const [firstId, secondId] = await commitPlates(userId, householdId, recipeId, [TODAY + DAY, TODAY + 2 * DAY]);

    await skipOne(firstId!);

    const [jar] = await listOf(householdId);
    expect(jar).toMatchObject({ ingredientId, quantity: 20 });
    expect(await ledgerOf(secondId!)).toMatchObject([{ groceryQuantity: 20, groceryListItemId: jar!._id }]);
  });

  /** The job fires whatever happened to the plate in the meantime, so cooked has to mean untouched. */
  test("leaves a cooked plate alone", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId } = await seedRecipe();
    const [mealId] = await commitPlates(userId, householdId, recipeId, [TODAY + DAY]);
    await t.run((ctx) => ctx.db.patch(mealId!, { status: "cooked", updatedAt: Date.now() }));
    const before = await ledgerOf(mealId!);

    await skipOne(mealId!);

    expect(await plateOf(mealId!)).toMatchObject({ status: "cooked" });
    expect(await ledgerOf(mealId!)).toEqual(before);
  });

  test("does nothing on a plate that is gone, or already skipped", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId } = await seedRecipe();
    const [mealId] = await commitPlates(userId, householdId, recipeId, [TODAY + DAY]);

    await skipOne(mealId!);
    const once = await plateOf(mealId!);
    await skipOne(mealId!);
    expect(await plateOf(mealId!)).toEqual(once);

    await t.run((ctx) => ctx.db.delete(mealId!));
    await expect(skipOne(mealId!)).resolves.not.toThrow();
  });

  /** The other half of the contract: every plate written is booked to be closed a day after its day. */
  test("is booked by commit for every plate, a day after its day", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId } = await seedRecipe();
    const dates = [TODAY + DAY, TODAY + 2 * DAY];
    const [firstId, secondId] = await commitPlates(userId, householdId, recipeId, dates);

    expect(await jobsOf(firstId!)).toMatchObject([{ scheduledTime: skipAt(dates[0]!), state: { kind: "pending" } }]);
    expect(await jobsOf(secondId!)).toMatchObject([{ scheduledTime: skipAt(dates[1]!) }]);
    expect(skipAt(dates[0]!)).toBe(dates[0]! + 2 * DAY);
  });
});
