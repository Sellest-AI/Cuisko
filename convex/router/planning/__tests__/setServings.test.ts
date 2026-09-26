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
      .filter(([path]) => path.startsWith("/convex/router/planning/setServings.") || path.startsWith("/convex/router/planning/commit."))
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
      status: "generated",
      isArchived: false,
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

const cellar = (householdId: Id<"households">, ingredientId: Id<"ingredients">, quantity: number) =>
  t.run((ctx) =>
    ctx.db.insert("cellarItems", { householdId, ingredientId, quantity, unit: "g", updatedAt: Date.now() }),
  );

/** Commits one plate of `servings` and answers the meal id, which the router keys on. */
const commitPlate = (
  userId: Id<"users">,
  householdId: Id<"households">,
  recipeId: Id<"recipes">,
  { servings = 2, date = TODAY + DAY, owned = [] as { ingredientId: Id<"ingredients">; unit: "g" }[] } = {},
) =>
  t
    .withIdentity(asUser(userId))
    .mutation(api.router.planning.commit.authed, {
      householdId,
      people: 2,
      seed: 0.5,
      today: TODAY,
      owned,
      plates: [{ recipeId, date, slot: "lunch" as const, servings }],
    })
    .then((mealPlanId) =>
      t.run(async (ctx) => {
        const meals = await ctx.db.query("plannedMeals").collect();
        return meals.find((meal) => meal.mealPlanId === mealPlanId)!._id;
      }),
    );

const setServings = (userId: Id<"users">, householdId: Id<"households">, mealId: Id<"plannedMeals">, servings: number) =>
  t.withIdentity(asUser(userId)).mutation(api.router.planning.setServings.authed, {
    householdId,
    mealId,
    servings,
    today: TODAY,
  });

/**
 * `t.run` hands back a ctx over the GENERIC data model, so `withIndex` has no index to name here and
 * these filter in memory — see `functions/planning/__tests__/syncMealLines.test.ts`. Fine over a
 * fixture of one household, and not a pattern to copy into `functions/`.
 */
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

describe("router/planning/setServings", () => {
  test("rejects an unauthenticated caller", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId } = await seedRecipe("Soupe");
    const mealId = await commitPlate(userId, householdId, recipeId);

    await expect(
      t.mutation(api.router.planning.setServings.authed, { householdId, mealId, servings: 4, today: TODAY }),
    ).rejects.toThrow();
  });

  test("rejects a caller who is not a member of the household", async () => {
    const { userId, householdId } = await seedMember();
    const outsiderId = await t.run((ctx) => ctx.db.insert("users", { name: "Outsider" }));
    const { recipeId } = await seedRecipe("Soupe");
    const mealId = await commitPlate(userId, householdId, recipeId);

    await expect(setServings(outsiderId, householdId, mealId, 4)).rejects.toThrow();
  });

  test("rejects a meal that belongs to another household", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId } = await seedRecipe("Soupe");
    const mealId = await commitPlate(userId, householdId, recipeId);
    const elsewhere = await seedMember();

    await expect(setServings(elsewhere.userId, elsewhere.householdId, mealId, 4)).rejects.toThrow();

    const untouched = await ledgerOf(mealId);
    expect(untouched).toMatchObject([{ sourceQuantity: 200 }]);
  });

  test("rescales the ledger and asks the list for what the bigger plate now needs", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId, ingredientId } = await seedRecipe("Soupe");
    await cellar(householdId, ingredientId, 150);
    const mealId = await commitPlate(userId, householdId, recipeId);

    // Committed at two servings the 200 g line is short 50 g; at four it is short 250 g.
    await setServings(userId, householdId, mealId, 4);

    expect(await listOf(householdId)).toMatchObject([{ ingredientId, quantity: 250, unit: "g" }]);
    expect(await ledgerOf(mealId)).toMatchObject([
      { ingredientId, sourceQuantity: 400, quantity: 400, groceryQuantity: 250 },
    ]);
  });

  /** The plate itself, not only its ledger: the lists read `servings` off the plate, and the sheet reads it back. */
  test("writes the new portions on the plate", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId } = await seedRecipe("Soupe");
    const mealId = await commitPlate(userId, householdId, recipeId);

    await setServings(userId, householdId, mealId, 3);

    const plate = await t.run((ctx) => ctx.db.get(mealId));
    expect(plate!.servings).toBe(3);
  });

  /** The cellar's verdict is re-run at the new size: a line it covered then and cannot cover now is asked for. */
  test("asks for a line the cellar covered at commit but cannot cover at the new size", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId, ingredientId } = await seedRecipe("Soupe");
    await cellar(householdId, ingredientId, 250);
    const mealId = await commitPlate(userId, householdId, recipeId);

    expect(await listOf(householdId)).toEqual([]);

    await setServings(userId, householdId, mealId, 4);

    expect(await listOf(householdId)).toMatchObject([{ quantity: 150 }]);
  });

  test("keeps a line the shopper ticked off the list", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId, ingredientId } = await seedRecipe("Soupe");
    const mealId = await commitPlate(userId, householdId, recipeId, {
      owned: [{ ingredientId, unit: "g" as const }],
    });

    await setServings(userId, householdId, mealId, 4);

    expect(await listOf(householdId)).toEqual([]);

    const [row] = await ledgerOf(mealId);
    expect(row!.owned).toBe(true);
    expect(row!.groceryQuantity).toBeUndefined();
  });

  /** The tick was taken per ingredient-and-unit: claiming the grams of an onion never claimed the pieces. */
  test("scopes the tick to the ingredient and unit it was given for", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId, ingredientId } = await seedRecipe("Soupe");
    // A second line of the same ingredient in pieces, which no cellar row can convert and only the
    // tick could suppress — the shape that told ingredient-level tick recovery apart from this one.
    await t.run((ctx) =>
      ctx.db.insert("recipeIngredients", {
        recipeId,
        ingredientId,
        position: 1,
        quantity: 2,
        unit: "pcs",
        updatedAt: Date.now(),
      }),
    );
    const mealId = await commitPlate(userId, householdId, recipeId, {
      owned: [{ ingredientId, unit: "g" as const }],
    });

    await setServings(userId, householdId, mealId, 4);

    // The grams stay claimed off the list; the pieces are bought at the new size.
    expect(await listOf(householdId)).toMatchObject([{ ingredientId, quantity: 4, unit: "pcs" }]);
  });

  /**
   * A sibling's ledger row records its full requirement, not the part it actually drew from the
   * cellar, so the reconstructed pool is short by what the siblings bought — and running the split
   * again for no change would put that shortfall on the list. Doing nothing does nothing.
   */
  test("leaves the list alone when the servings have not changed", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId, ingredientId } = await seedRecipe("Soupe");
    await cellar(householdId, ingredientId, 300);
    const first = await commitPlate(userId, householdId, recipeId);
    await commitPlate(userId, householdId, recipeId, { date: TODAY + 2 * DAY });

    // The first plate was covered by the cellar; the second bought its shortfall.
    expect(await listOf(householdId)).toMatchObject([{ quantity: 100 }]);

    await setServings(userId, householdId, first, 2);

    expect(await listOf(householdId)).toMatchObject([{ quantity: 100 }]);
  });

  /**
   * The re-sync backs the plate's old jar out and rewrites its pinch. The jar a later plate lives
   * off passes to that plate and stays present for the rewrite, so the week still holds one jar —
   * not two, and not none.
   */
  test("keeps one jar on the list when the plate that bought it is re-portioned", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId, ingredientId } = await seedPinchRecipe();
    const first = await commitPlate(userId, householdId, recipeId);
    const second = await commitPlate(userId, householdId, recipeId, { date: TODAY + 2 * DAY });

    await setServings(userId, householdId, first, 4);

    expect(await listOf(householdId)).toMatchObject([{ ingredientId, quantity: 20, unit: "g" }]);
    expect(await ledgerOf(second)).toMatchObject([{ groceryQuantity: 20 }]);
    expect((await ledgerOf(first))[0]!.groceryQuantity).toBeUndefined();
  });

  test("refuses a plate whose day has passed", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId, ingredientId } = await seedRecipe("Soupe");
    await cellar(householdId, ingredientId, 150);
    const mealId = await commitPlate(userId, householdId, recipeId, { date: TODAY - DAY });

    await expect(setServings(userId, householdId, mealId, 4)).rejects.toThrow();

    expect(await listOf(householdId)).toMatchObject([{ quantity: 50 }]);
  });

  test("refuses a plate that has been cooked", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId } = await seedRecipe("Soupe");
    const mealId = await commitPlate(userId, householdId, recipeId);
    await t.run((ctx) => ctx.db.patch(mealId, { status: "cooked", updatedAt: Date.now() }));

    await expect(setServings(userId, householdId, mealId, 4)).rejects.toThrow();
  });

  test("refuses a size nobody cooks for", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId } = await seedRecipe("Soupe");
    const mealId = await commitPlate(userId, householdId, recipeId);

    for (const servings of [0, 9, 2.5])
      await expect(setServings(userId, householdId, mealId, servings)).rejects.toThrow();
  });
});
