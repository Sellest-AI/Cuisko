import { convexTest } from "convex-test";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import type { Id } from "../../../_generated/dataModel";
import { api } from "../../../_generated/api";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** Imports the module under test before any test is timed — see commit.test.ts. */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/planning/planOne."))
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

/** A recipe of one 200 g line of its own ingredient, written for two, owned by the catalog when `userId` is left out. */
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
      status: "generated",
      isArchived: false,
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

const planOne = (
  userId: Id<"users">,
  householdId: Id<"households">,
  recipeId: Id<"recipes">,
  { date = TODAY + DAY, servings = 2 }: { date?: number; servings?: number } = {},
) =>
  t.withIdentity(asUser(userId)).mutation(api.router.planning.planOne.authed, {
    householdId, recipeId, date, slot: "lunch", servings, today: TODAY,
  });

const platesOf = (householdId: Id<"households">) =>
  t.run(async (ctx) => {
    const rows = await ctx.db.query("plannedMeals").collect();
    return rows.filter((row) => row.householdId === householdId);
  });

const listOf = (householdId: Id<"households">) =>
  t.run(async (ctx) => {
    const rows = await ctx.db.query("groceryListItems").collect();
    return rows.filter((row) => row.householdId === householdId);
  });

const plansOf = (householdId: Id<"households">) =>
  t.run(async (ctx) => {
    const rows = await ctx.db.query("mealPlans").collect();
    return rows.filter((plan) => plan.householdId === householdId);
  });

describe("router/planning/planOne", () => {
  test("rejects an unauthenticated caller", async () => {
    const { householdId } = await seedMember();
    const { recipeId } = await seedRecipe("Soupe");

    await expect(
      t.mutation(api.router.planning.planOne.authed, {
        householdId, recipeId, date: TODAY + DAY, slot: "lunch", servings: 2, today: TODAY,
      }),
    ).rejects.toThrow();
  });

  test("rejects a caller who is not a member of the household", async () => {
    const { householdId } = await seedMember();
    const outsiderId = await t.run((ctx) => ctx.db.insert("users", { name: "Outsider" }));
    const { recipeId } = await seedRecipe("Soupe");

    await expect(planOne(outsiderId, householdId, recipeId)).rejects.toThrow();
    expect(await platesOf(householdId)).toEqual([]);
  });

  /** The catalog is shared (ADR 0014): another cook's recipe lands on the plate like any other. */
  test("plans another cook's recipe", async () => {
    const { userId, householdId } = await seedMember();
    const elsewhere = await seedMember();
    const { recipeId } = await seedRecipe("Shared", elsewhere.userId);

    await planOne(userId, householdId, recipeId);

    expect(await platesOf(householdId)).toMatchObject([{ recipeId }]);
  });

  /** A plan of one plate, with no shuffle behind it, and the missing 200 g on the list. */
  test("writes the plate, a seedless plan and its groceries", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId, ingredientId } = await seedRecipe("Soupe");

    const mealPlanId = await planOne(userId, householdId, recipeId, { date: TODAY, servings: 4 });

    expect(await plansOf(householdId)).toMatchObject([{ _id: mealPlanId, people: 4, days: 1, slots: ["lunch"] }]);
    expect((await plansOf(householdId))[0]!.seed).toBeUndefined();
    expect(await platesOf(householdId)).toMatchObject([{ mealPlanId, recipeId, date: TODAY, slot: "lunch", servings: 4 }]);
    // Written for two, cooked for four: the line doubles.
    expect(await listOf(householdId)).toMatchObject([{ ingredientId, quantity: 400, unit: "g" }]);
  });

  test("replaces the plate already on that day and slot, and its claims with it", async () => {
    const { userId, householdId } = await seedMember();
    const first = await seedRecipe("Soupe");
    const second = await seedRecipe("Risotto");

    await planOne(userId, householdId, first.recipeId);
    await planOne(userId, householdId, second.recipeId);

    expect(await platesOf(householdId)).toMatchObject([{ recipeId: second.recipeId }]);
    expect(await plansOf(householdId)).toHaveLength(1);
    expect(await listOf(householdId)).toMatchObject([{ ingredientId: second.ingredientId, quantity: 200 }]);
  });

  test("leaves the other slot of that day alone", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId } = await seedRecipe("Soupe");

    await t.withIdentity(asUser(userId)).mutation(api.router.planning.planOne.authed, {
      householdId, recipeId, date: TODAY + DAY, slot: "dinner", servings: 2, today: TODAY,
    });
    await planOne(userId, householdId, recipeId);

    expect((await platesOf(householdId)).map((plate) => plate.slot).sort()).toEqual(["dinner", "lunch"]);
  });

  test("refuses to replace a plate that has been cooked", async () => {
    const { userId, householdId } = await seedMember();
    const first = await seedRecipe("Soupe");
    const second = await seedRecipe("Risotto");

    await planOne(userId, householdId, first.recipeId);
    const [cooked] = await platesOf(householdId);
    await t.run((ctx) => ctx.db.patch(cooked!._id, { status: "cooked", updatedAt: Date.now() }));

    await expect(planOne(userId, householdId, second.recipeId)).rejects.toThrow();
    expect(await platesOf(householdId)).toMatchObject([{ recipeId: first.recipeId, status: "cooked" }]);
  });

  test("refuses a day that has passed", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId } = await seedRecipe("Soupe");

    await expect(planOne(userId, householdId, recipeId, { date: TODAY - DAY })).rejects.toThrow();
    expect(await platesOf(householdId)).toEqual([]);
  });

  test("refuses a plate for nobody", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId } = await seedRecipe("Soupe");

    await expect(planOne(userId, householdId, recipeId, { servings: 0 })).rejects.toThrow();
  });
});
