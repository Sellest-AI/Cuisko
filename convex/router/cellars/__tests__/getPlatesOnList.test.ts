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
      .filter(([path]) => path.startsWith("/convex/router/cellars/getPlatesOnList."))
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

/** One plate per date, all of the same recipe — the shape a repeated dish takes in a week. */
const seedPlates = (householdId: Id<"households">, dates: number[]) =>
  t.run(async (ctx) => {
    const recipeId = await ctx.db.insert("recipes", {
      status: "generated",
      isArchived: false,
      title: { values: { fr: "Lasagnes", en: "Lasagna" }, meta: {} },
      description: { values: { fr: "" }, meta: {} },
      instructions: { values: { fr: "" }, meta: {} },
      servings: 2,
      equipments: [],
      difficulty: 1,
      tags: [],
      cuisine: "italian",
      timings: { cooking: 20 },
      search: { en: "", fr: "" },
      shuffleKey: 0.5,
      isVegan: false,
      isVegetarian: true,
      isPescatarian: true,
      isGlutenFree: false,
      isDairyFree: false,
      isNutFree: true,
      updatedAt: Date.now(),
    });
    const mealPlanId = await ctx.db.insert("mealPlans", {
      householdId, startDate: dates[0]!, days: dates.length, slots: ["lunch"], people: 2, seed: 0.5, updatedAt: Date.now(),
    });
    const plateIds: Id<"plannedMeals">[] = [];
    for (const date of dates)
      plateIds.push(await ctx.db.insert("plannedMeals", {
        mealPlanId, householdId, recipeId, date, slot: "lunch", servings: 2, status: "planned", updatedAt: Date.now(),
      }));
    return { recipeId, plateIds };
  });

const seedIngredient = () =>
  t.run((ctx) =>
    ctx.db.insert("ingredients", {
      name: { values: { fr: "Parmesan" }, meta: {} },
      category: "DAIRY",
      emoji: "🧀",
      allergens: [],
      defaultUnit: "g",
      defaultQuantity: 100,
      nutrition: { calories: 400, protein: 30, fat: 30, carbohydrates: 0 },
      updatedAt: Date.now(),
    }),
  );

const getPlates = (userId: Id<"users">, householdId: Id<"households">) =>
  t.withIdentity(asUser(userId)).query(api.router.cellars.getPlatesOnList.authed, { householdId, locale: "en" });

describe("router/cellars/getPlatesOnList", () => {
  test("rejects an unauthenticated caller", async () => {
    const { householdId } = await seedMember();

    await expect(
      t.query(api.router.cellars.getPlatesOnList.authed, { householdId, locale: "en" }),
    ).rejects.toThrow();
  });

  test("rejects a caller who is not a member of the household", async () => {
    const { householdId } = await seedMember();
    const outsiderId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { name: "Outsider" });
      await ctx.db.insert("usersExtended", { userId, role: "USER", updatedAt: Date.now() });
      return userId;
    });

    await expect(getPlates(outsiderId, householdId)).rejects.toThrow();
  });

  /**
   * The whole reason this query exists: two plates of one recipe come back as two plates, each
   * with its own share of the one merged list row. Monday's shopper wants Monday's 200 g.
   */
  test("returns each planned plate with its own share of the list row, one recipe or not", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId, plateIds: [monday, friday] } = await seedPlates(householdId, [TODAY, TODAY + 4 * DAY]);
    const ingredientId = await seedIngredient();

    const lineId = await t.run(async (ctx) => {
      const lineId = await ctx.db.insert("groceryListItems", { householdId, ingredientId, unit: "g", quantity: 300, updatedAt: Date.now() });
      const claim = { ingredientId, sourceQuantity: 0, sourceUnit: "g" as const, quantity: 0, unit: "g" as const, groceryListItemId: lineId, updatedAt: Date.now() };
      await ctx.db.insert("plannedMealIngredients", { ...claim, plannedMealId: monday!, groceryQuantity: 200 });
      await ctx.db.insert("plannedMealIngredients", { ...claim, plannedMealId: friday!, groceryQuantity: 100 });
      return lineId;
    });

    const plates = await getPlates(userId, householdId);

    expect(plates).toHaveLength(2);
    expect(plates.map((plate) => plate.title)).toEqual(["Lasagna", "Lasagna"]);
    // Both name the recipe behind them, which is what a tap on the heading opens.
    expect(plates.map((plate) => plate.recipeId)).toEqual([recipeId, recipeId]);
    expect(plates.find((plate) => plate.id === monday)!.claims).toEqual([{ lineId, amount: 200 }]);
    expect(plates.find((plate) => plate.id === friday)!.claims).toEqual([{ lineId, amount: 100 }]);
  });

  test("leaves out a cooked plate, a claim whose row left the list, and a line ticked as owned", async () => {
    const { userId, householdId } = await seedMember();
    const { plateIds: [cooked, bought, owned] } = await seedPlates(householdId, [TODAY, TODAY + DAY, TODAY + 2 * DAY]);
    const ingredientId = await seedIngredient();

    await t.run(async (ctx) => {
      const onList = await ctx.db.insert("groceryListItems", { householdId, ingredientId, unit: "g", quantity: 200, updatedAt: Date.now() });
      const gone = await ctx.db.insert("groceryListItems", { householdId, ingredientId, unit: "g", quantity: 200, updatedAt: Date.now() });
      await ctx.db.delete(gone);

      const claim = { ingredientId, sourceQuantity: 0, sourceUnit: "g" as const, quantity: 0, unit: "g" as const, updatedAt: Date.now() };
      await ctx.db.insert("plannedMealIngredients", { ...claim, plannedMealId: cooked!, groceryListItemId: onList, groceryQuantity: 200 });
      await ctx.db.patch(cooked!, { status: "cooked" });
      await ctx.db.insert("plannedMealIngredients", { ...claim, plannedMealId: bought!, groceryListItemId: gone, groceryQuantity: 200 });
      await ctx.db.insert("plannedMealIngredients", { ...claim, plannedMealId: owned!, groceryListItemId: onList, owned: true });
    });

    expect(await getPlates(userId, householdId)).toEqual([]);
  });
});
