import { convexTest } from "convex-test";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import type { Id } from "../../../_generated/dataModel";
import { api } from "../../../_generated/api";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** Imports the module under test before any test is timed — see router/preferences/__tests__/getPlanningSeed.test.ts. */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/planning/commit."))
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

/** A recipe of one 200 g line, owned by `userId` or by the catalog when that is left out. */
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

const args = (
  householdId: Id<"households">,
  recipeId: Id<"recipes">,
  { servings = 2 }: { servings?: number } = {},
) => ({
  householdId,
  people: 2,
  seed: 0.5,
  today: TODAY,
  owned: [],
  plates: [{ recipeId, date: TODAY + DAY, slot: "lunch" as const, servings }],
});

describe("router/planning/commit", () => {
  test("rejects an unauthenticated caller", async () => {
    const householdId = await seedHousehold();
    const { recipeId } = await seedRecipe("Soupe");

    await expect(t.mutation(api.router.planning.commit.authed, args(householdId, recipeId))).rejects.toThrow();
  });

  test("rejects a caller who is not a member of the household", async () => {
    const householdId = await seedHousehold();
    const outsiderId = await seedUser();
    const { recipeId } = await seedRecipe("Soupe");

    await expect(
      t.withIdentity(asUser(outsiderId)).mutation(api.router.planning.commit.authed, args(householdId, recipeId)),
    ).rejects.toThrow();
  });

  /** The catalog is shared (ADR 0014): a plate may name another cook's recipe, and the plate holds only its id. */
  test("commits a plate naming another cook's recipe", async () => {
    const householdId = await seedHousehold();
    const userId = await seedUser();
    await join(householdId, userId);
    const strangerId = await seedUser();
    const { recipeId } = await seedRecipe("Shared", strangerId);

    const mealPlanId = await t
      .withIdentity(asUser(userId))
      .mutation(api.router.planning.commit.authed, args(householdId, recipeId));

    const meals = await t.run(async (ctx) =>
      (await ctx.db.query("plannedMeals").collect()).filter((meal) => meal.mealPlanId === mealPlanId),
    );

    expect(meals).toMatchObject([{ recipeId }]);
  });

  test("rejects a plate naming a recipe that does not exist", async () => {
    const householdId = await seedHousehold();
    const userId = await seedUser();
    await join(householdId, userId);
    const { recipeId } = await seedRecipe("Gone");
    await t.run((ctx) => ctx.db.delete(recipeId));

    await expect(
      t.withIdentity(asUser(userId)).mutation(api.router.planning.commit.authed, args(householdId, recipeId)),
    ).rejects.toThrow();
  });

  test("writes the plan, its plates and their ledger, and puts what is missing on the list", async () => {
    const householdId = await seedHousehold();
    const userId = await seedUser();
    await join(householdId, userId);
    const { recipeId, ingredientId } = await seedRecipe("Soupe");

    const mealPlanId = await t
      .withIdentity(asUser(userId))
      .mutation(api.router.planning.commit.authed, args(householdId, recipeId, { servings: 4 }));

    const written = await t.run(async (ctx) => ({
      plan: await ctx.db.get(mealPlanId),
      meals: (await ctx.db.query("plannedMeals").collect()).filter((meal) => meal.mealPlanId === mealPlanId),
      list: await ctx.db.query("groceryListItems").collect(),
    }));

    expect(written.plan).toMatchObject({ householdId, startDate: TODAY + DAY, days: 1, slots: ["lunch"], people: 2 });
    expect(written.meals).toMatchObject([{ recipeId, servings: 4, status: "planned", date: TODAY + DAY }]);
    // The recipe serves two and the plate is for four, so its single 200 g line doubles.
    expect(written.list).toMatchObject([{ ingredientId, quantity: 400, unit: "g" }]);

    const ledger = await t.run((ctx) => ctx.db.query("plannedMealIngredients").collect());

    expect(ledger).toMatchObject([{ ingredientId, sourceQuantity: 400, quantity: 400, groceryQuantity: 400 }]);
  });

  /** The cellar decides the split, and it is read at commit time rather than trusted from the draft. */
  test("buys only what the cellar is short of", async () => {
    const householdId = await seedHousehold();
    const userId = await seedUser();
    await join(householdId, userId);
    const { recipeId, ingredientId } = await seedRecipe("Soupe");
    await t.run((ctx) =>
      ctx.db.insert("cellarItems", { householdId, ingredientId, quantity: 150, unit: "g", updatedAt: Date.now() }),
    );

    await t.withIdentity(asUser(userId)).mutation(api.router.planning.commit.authed, args(householdId, recipeId));

    const list = await t.run((ctx) => ctx.db.query("groceryListItems").collect());

    expect(list).toMatchObject([{ quantity: 50 }]);
  });

  test("buys nothing for a row the shopper says is already in the kitchen", async () => {
    const householdId = await seedHousehold();
    const userId = await seedUser();
    await join(householdId, userId);
    const { recipeId, ingredientId } = await seedRecipe("Soupe");

    await t.withIdentity(asUser(userId)).mutation(api.router.planning.commit.authed, {
      ...args(householdId, recipeId),
      owned: [{ ingredientId, unit: "g" as const }],
    });

    const list = await t.run((ctx) => ctx.db.query("groceryListItems").collect());

    expect(list).toEqual([]);
  });

  /**
   * The round trip across units. The shopper typed "1 kg" by hand before the week was kept; the
   * week's 400 g line merges into that row rather than opening a second tile, its ledger records
   * the 0.4 kg that landed, and dropping the plate strikes exactly that back off — the shopper's
   * own kilogram is what is left.
   */
  test("merges into a row the shopper holds in another unit, and dropping the plate gives back exactly what landed", async () => {
    const householdId = await seedHousehold();
    const userId = await seedUser();
    await join(householdId, userId);
    const { recipeId, ingredientId } = await seedRecipe("Pain");
    await t.run((ctx) =>
      ctx.db.insert("groceryListItems", { householdId, ingredientId, quantity: 1, unit: "kg", updatedAt: Date.now() }),
    );

    const mealPlanId = await t
      .withIdentity(asUser(userId))
      .mutation(api.router.planning.commit.authed, args(householdId, recipeId, { servings: 4 }));

    const kept = await t.run(async (ctx) => ({
      list: await ctx.db.query("groceryListItems").collect(),
      ledger: await ctx.db.query("plannedMealIngredients").collect(),
      meals: (await ctx.db.query("plannedMeals").collect()).filter((meal) => meal.mealPlanId === mealPlanId),
    }));

    expect(kept.list).toMatchObject([{ ingredientId, unit: "kg", quantity: 1.4 }]);
    expect(kept.ledger).toMatchObject([{ quantity: 400, unit: "g", groceryQuantity: 0.4, groceryListItemId: kept.list[0]!._id }]);

    await t
      .withIdentity(asUser(userId))
      .mutation(api.router.planning.removeOne.authed, { householdId, mealId: kept.meals[0]!._id, today: TODAY });

    const list = await t.run((ctx) => ctx.db.query("groceryListItems").collect());
    expect(list).toMatchObject([{ unit: "kg" }]);
    // Within float noise: 1.4 - 0.4 is not exactly 1, and the list's copy is rounded for display.
    expect(list[0]!.quantity).toBeCloseTo(1, 9);
  });

  /**
   * The invariant a week holds server-side: one plate per day and slot, whatever the client chose
   * as dates. The old plate's ledger goes with it and its groceries are given back, so the list
   * shops for the new dish alone.
   */
  test("replaces the plate already on a day and slot, and its claims with it", async () => {
    const householdId = await seedHousehold();
    const userId = await seedUser();
    await join(householdId, userId);
    const first = await seedRecipe("Soupe");
    const second = await seedRecipe("Risotto");
    const as = t.withIdentity(asUser(userId));

    const firstPlanId = await as.mutation(api.router.planning.commit.authed, args(householdId, first.recipeId));
    const secondPlanId = await as.mutation(api.router.planning.commit.authed, {
      ...args(householdId, second.recipeId),
      plates: [
        { recipeId: second.recipeId, date: TODAY + DAY, slot: "lunch" as const, servings: 2 },
        { recipeId: second.recipeId, date: TODAY + 2 * DAY, slot: "lunch" as const, servings: 2 },
      ],
    });

    const kept = await t.run(async (ctx) => ({
      plans: await ctx.db.query("mealPlans").collect(),
      meals: await ctx.db.query("plannedMeals").collect(),
      ledger: await ctx.db.query("plannedMealIngredients").collect(),
      list: await ctx.db.query("groceryListItems").collect(),
    }));

    expect(kept.meals.map((meal) => [meal.date, meal.slot, meal.recipeId])).toEqual([
      [TODAY + DAY, "lunch", second.recipeId],
      [TODAY + 2 * DAY, "lunch", second.recipeId],
    ]);
    expect(kept.meals.every((meal) => meal.mealPlanId === secondPlanId)).toBe(true);
    // The first plan lost its only plate, and a plan with no plate is not kept.
    expect(kept.plans.map((plan) => plan._id)).toEqual([secondPlanId]);
    expect(kept.plans.map((plan) => plan._id)).not.toContain(firstPlanId);
    expect(kept.ledger.map((row) => row.ingredientId)).toEqual([second.ingredientId, second.ingredientId]);
    expect(kept.list).toMatchObject([{ ingredientId: second.ingredientId, quantity: 400, unit: "g" }]);
  });

  test("leaves a plate on another slot of the same day alone", async () => {
    const householdId = await seedHousehold();
    const userId = await seedUser();
    await join(householdId, userId);
    const first = await seedRecipe("Soupe");
    const second = await seedRecipe("Risotto");
    const as = t.withIdentity(asUser(userId));

    await as.mutation(api.router.planning.commit.authed, args(householdId, first.recipeId));
    await as.mutation(api.router.planning.commit.authed, {
      ...args(householdId, second.recipeId),
      plates: [{ recipeId: second.recipeId, date: TODAY + DAY, slot: "dinner" as const, servings: 2 }],
    });

    const meals = await t.run((ctx) => ctx.db.query("plannedMeals").collect());

    expect(meals.map((meal) => [meal.slot, meal.recipeId]).sort()).toEqual([
      ["dinner", second.recipeId],
      ["lunch", first.recipeId],
    ]);
  });

  /** A cooked plate is a record the cook step settles against: the week is refused whole, not written around it. */
  test("refuses a week that would replace a cooked plate, and writes none of it", async () => {
    const householdId = await seedHousehold();
    const userId = await seedUser();
    await join(householdId, userId);
    const first = await seedRecipe("Soupe");
    const second = await seedRecipe("Risotto");
    const as = t.withIdentity(asUser(userId));

    await as.mutation(api.router.planning.commit.authed, args(householdId, first.recipeId));
    const [cooked] = await t.run((ctx) => ctx.db.query("plannedMeals").collect());
    await t.run((ctx) => ctx.db.patch(cooked!._id, { status: "cooked", updatedAt: Date.now() }));

    await expect(
      as.mutation(api.router.planning.commit.authed, {
        ...args(householdId, second.recipeId),
        plates: [
          { recipeId: second.recipeId, date: TODAY + DAY, slot: "lunch" as const, servings: 2 },
          { recipeId: second.recipeId, date: TODAY + 2 * DAY, slot: "lunch" as const, servings: 2 },
        ],
      }),
    ).rejects.toThrow();

    const meals = await t.run((ctx) => ctx.db.query("plannedMeals").collect());

    expect(meals).toMatchObject([{ recipeId: first.recipeId, status: "cooked" }]);
  });

  test("refuses two plates on the same day and slot", async () => {
    const householdId = await seedHousehold();
    const userId = await seedUser();
    await join(householdId, userId);
    const { recipeId } = await seedRecipe("Soupe");

    await expect(
      t.withIdentity(asUser(userId)).mutation(api.router.planning.commit.authed, {
        ...args(householdId, recipeId),
        plates: [
          { recipeId, date: TODAY + DAY, slot: "lunch" as const, servings: 2 },
          { recipeId, date: TODAY + DAY, slot: "lunch" as const, servings: 2 },
        ],
      }),
    ).rejects.toThrow();
  });

  test("refuses a week of no plates at all", async () => {
    const householdId = await seedHousehold();
    const userId = await seedUser();
    await join(householdId, userId);
    const { recipeId } = await seedRecipe("Soupe");

    await expect(
      t
        .withIdentity(asUser(userId))
        .mutation(api.router.planning.commit.authed, { ...args(householdId, recipeId), plates: [] }),
    ).rejects.toThrow();
  });
});
