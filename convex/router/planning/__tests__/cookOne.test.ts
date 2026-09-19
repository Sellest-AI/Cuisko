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
      .filter(([path]) => path.startsWith("/convex/router/planning/cookOne.") || path.startsWith("/convex/router/planning/planOne."))
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

const stock = (householdId: Id<"households">, ingredientId: Id<"ingredients">, quantity: number) =>
  t.run((ctx) => ctx.db.insert("cellarItems", { householdId, ingredientId, quantity, unit: "g", updatedAt: Date.now() }));

const planOne = (
  userId: Id<"users">,
  householdId: Id<"households">,
  recipeId: Id<"recipes">,
  { date = TODAY, slot = "lunch" as "lunch" | "dinner", servings = 2 } = {},
) =>
  t.withIdentity(asUser(userId)).mutation(api.router.planning.planOne.authed, {
    householdId, recipeId, date, slot, servings, today: TODAY,
  });

const cookOne = (
  userId: Id<"users">,
  householdId: Id<"households">,
  recipeId: Id<"recipes">,
  { hour = 12, servings = 2 } = {},
) =>
  t.withIdentity(asUser(userId)).mutation(api.router.planning.cookOne.authed, {
    householdId, recipeId, servings, today: TODAY, hour,
  });

const platesOf = (householdId: Id<"households">) =>
  t.run(async (ctx) => (await ctx.db.query("plannedMeals").collect()).filter((row) => row.householdId === householdId));

const listOf = (householdId: Id<"households">) =>
  t.run(async (ctx) => (await ctx.db.query("groceryListItems").collect()).filter((row) => row.householdId === householdId));

const cellarOf = (householdId: Id<"households">) =>
  t.run(async (ctx) => (await ctx.db.query("cellarItems").collect()).filter((row) => row.householdId === householdId));

const plansOf = (householdId: Id<"households">) =>
  t.run(async (ctx) => (await ctx.db.query("mealPlans").collect()).filter((row) => row.householdId === householdId));

const ledgerOf = (plannedMealId: Id<"plannedMeals">) =>
  t.run(async (ctx) => (await ctx.db.query("plannedMealIngredients").collect()).filter((row) => row.plannedMealId === plannedMealId));

describe("router/planning/cookOne", () => {
  test("rejects an unauthenticated caller", async () => {
    const { householdId } = await seedMember();
    const { recipeId } = await seedRecipe("Soupe");

    await expect(
      t.mutation(api.router.planning.cookOne.authed, { householdId, recipeId, servings: 2, today: TODAY, hour: 12 }),
    ).rejects.toThrow();
  });

  test("rejects a caller who is not a member of the household", async () => {
    const { householdId } = await seedMember();
    const outsiderId = await t.run((ctx) => ctx.db.insert("users", { name: "Outsider" }));
    const { recipeId, ingredientId } = await seedRecipe("Soupe");
    await stock(householdId, ingredientId, 500);

    await expect(cookOne(outsiderId, householdId, recipeId)).rejects.toThrow();
    expect(await cellarOf(householdId)).toMatchObject([{ quantity: 500 }]);
  });

  /** The stepper is clamped to the same rule; a client that is not ours gets refused before the cellar moves. */
  test("refuses servings outside the rule, and touches nothing", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId, ingredientId } = await seedRecipe("Soupe");
    await stock(householdId, ingredientId, 500);

    await expect(cookOne(userId, householdId, recipeId, { servings: 9 })).rejects.toThrow();
    await expect(cookOne(userId, householdId, recipeId, { servings: 0 })).rejects.toThrow();
    await expect(cookOne(userId, householdId, recipeId, { servings: 1.5 })).rejects.toThrow();
    expect(await cellarOf(householdId)).toMatchObject([{ quantity: 500 }]);
    expect(await platesOf(householdId)).toEqual([]);
  });

  /** The catalog is shared (ADR 0014): another cook's recipe spends this household's cellar, nobody else's. */
  test("cooks another cook's recipe out of this household's cellar only", async () => {
    const { userId, householdId } = await seedMember();
    const elsewhere = await seedMember();
    const { recipeId, ingredientId } = await seedRecipe("Shared", elsewhere.userId);
    await stock(householdId, ingredientId, 500);
    await stock(elsewhere.householdId, ingredientId, 500);

    await cookOne(userId, householdId, recipeId);

    expect(await cellarOf(householdId)).toMatchObject([{ quantity: 300 }]);
    expect(await cellarOf(elsewhere.householdId)).toMatchObject([{ quantity: 500 }]);
  });

  describe("a planned plate", () => {
    /** Nothing in the cellar, so the plate put 200 g on the list; cooking it takes them back off. */
    test("is marked cooked and its claims leave the list", async () => {
      const { userId, householdId } = await seedMember();
      const { recipeId } = await seedRecipe("Soupe");
      await planOne(userId, householdId, recipeId);
      expect(await listOf(householdId)).toMatchObject([{ quantity: 200 }]);

      const plateId = await cookOne(userId, householdId, recipeId);

      expect(await platesOf(householdId)).toMatchObject([{ _id: plateId, status: "cooked" }]);
      expect(await listOf(householdId)).toEqual([]);
      const [row] = await ledgerOf(plateId);
      expect(row).toMatchObject({ quantity: 0 });
      expect(row).not.toHaveProperty("groceryListItemId");
      expect(row).not.toHaveProperty("cellarItemId");
    });

    /** Two plates of the same dish share a list row: cooking one leaves the other's share. */
    test("takes back only its own share of a merged list row", async () => {
      const { userId, householdId } = await seedMember();
      const { recipeId, ingredientId } = await seedRecipe("Soupe");
      await planOne(userId, householdId, recipeId, { slot: "lunch" });
      await planOne(userId, householdId, recipeId, { slot: "dinner" });
      expect(await listOf(householdId)).toMatchObject([{ ingredientId, quantity: 400 }]);

      await cookOne(userId, householdId, recipeId, { hour: 12 });

      expect(await listOf(householdId)).toMatchObject([{ ingredientId, quantity: 200 }]);
    });

    /** Planned for two with 500 g on the shelf, cooked for six: the cellar loses 600 g, the record says six. */
    test("spends the cellar at the servings cooked, and the plate follows", async () => {
      const { userId, householdId } = await seedMember();
      const { recipeId, ingredientId } = await seedRecipe("Soupe");
      await stock(householdId, ingredientId, 1000);
      await planOne(userId, householdId, recipeId, { servings: 2 });

      const plateId = await cookOne(userId, householdId, recipeId, { servings: 6 });

      expect(await cellarOf(householdId)).toMatchObject([{ quantity: 400 }]);
      expect(await platesOf(householdId)).toMatchObject([{ servings: 6, status: "cooked" }]);
      expect(await ledgerOf(plateId)).toMatchObject([{ quantity: 600, unit: "g", sourceQuantity: 200 }]);
    });

    test("at 16h, with the dish on lunch and dinner, settles lunch", async () => {
      const { userId, householdId } = await seedMember();
      const { recipeId } = await seedRecipe("Pizza");
      await planOne(userId, householdId, recipeId, { slot: "lunch" });
      await planOne(userId, householdId, recipeId, { slot: "dinner" });

      await cookOne(userId, householdId, recipeId, { hour: 16 });

      const plates = await platesOf(householdId);
      expect(plates.find((plate) => plate.slot === "lunch")).toMatchObject({ status: "cooked" });
      expect(plates.find((plate) => plate.slot === "dinner")).toMatchObject({ status: "planned" });
    });

    test("cooked twice, the second cook settles the next plate rather than the same one", async () => {
      const { userId, householdId } = await seedMember();
      const { recipeId } = await seedRecipe("Pizza");
      await planOne(userId, householdId, recipeId, { slot: "lunch" });
      await planOne(userId, householdId, recipeId, { slot: "dinner" });

      await cookOne(userId, householdId, recipeId, { hour: 12 });
      await cookOne(userId, householdId, recipeId, { hour: 12 });

      expect((await platesOf(householdId)).map((plate) => plate.status)).toEqual(["cooked", "cooked"]);
    });
  });

  describe("no plate", () => {
    test("records a cooked plate on today, in its own plan, and touches the list not at all", async () => {
      const { userId, householdId } = await seedMember();
      const { recipeId, ingredientId } = await seedRecipe("Omelette");
      await stock(householdId, ingredientId, 500);

      const plateId = await cookOne(userId, householdId, recipeId, { hour: 20, servings: 3 });

      expect(await platesOf(householdId)).toMatchObject([
        { _id: plateId, recipeId, date: TODAY, slot: "dinner", servings: 3, status: "cooked" },
      ]);
      expect(await plansOf(householdId)).toMatchObject([{ startDate: TODAY, days: 1, slots: ["dinner"], people: 3 }]);
      expect((await plansOf(householdId))[0]!.seed).toBeUndefined();
      expect(await listOf(householdId)).toEqual([]);
      expect(await cellarOf(householdId)).toMatchObject([{ quantity: 200 }]);
      expect(await ledgerOf(plateId)).toMatchObject([{ ingredientId, quantity: 300, unit: "g", sourceQuantity: 300 }]);
    });

    test("a plate two days out is not this cook", async () => {
      const { userId, householdId } = await seedMember();
      const { recipeId } = await seedRecipe("Soupe");
      await planOne(userId, householdId, recipeId, { date: TODAY + 2 * DAY });

      await cookOne(userId, householdId, recipeId);

      const plates = await platesOf(householdId);
      expect(plates).toHaveLength(2);
      expect(plates.find((plate) => plate.date === TODAY)).toMatchObject({ status: "cooked" });
      expect(plates.find((plate) => plate.date === TODAY + 2 * DAY)).toMatchObject({ status: "planned" });
      expect(await listOf(householdId)).toMatchObject([{ quantity: 200 }]);
    });

    test("before lunch, the record lands on lunch", async () => {
      const { userId, householdId } = await seedMember();
      const { recipeId } = await seedRecipe("Crêpes");

      await cookOne(userId, householdId, recipeId, { hour: 8 });

      expect(await platesOf(householdId)).toMatchObject([{ slot: "lunch" }]);
    });
  });
});
