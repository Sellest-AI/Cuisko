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
      .filter(([path]) => path.startsWith("/convex/router/planning/getDraft."))
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

/** A catalog recipe (no `userId`) of one line, whose ingredient carries `allergens`. */
const seedRecipe = (title: string, shuffleKey: number, allergens: ("gluten" | "milk")[]) =>
  t.run(async (ctx) => {
    const ingredientId = await ctx.db.insert("ingredients", {
      name: { values: { fr: title }, meta: {} },
      category: "VEGETABLE",
      emoji: "🍅",
      allergens,
      defaultUnit: "g",
      defaultQuantity: 500,
      nutrition: { calories: 10, protein: 1, fat: 1, carbohydrates: 1 },
      updatedAt: Date.now(),
    });
    const recipeId = await insertTestRecipe(ctx.db, {
      title: { values: { fr: title }, meta: {} },
      timings: { cooking: 20 },
      shuffleKey,
      isVegan: true,
      isVegetarian: true,
      isPescatarian: true,
    });
    await ctx.db.insert("recipeIngredients", {
      recipeId,
      ingredientId,
      position: 0,
      quantity: 200,
      unit: "g",
      updatedAt: Date.now(),
    });
    return recipeId;
  });

const args = (householdId: Id<"households">, overrides: { avoids?: ("gluten" | "milk")[] } = {}) => ({
  householdId,
  locale: "fr" as const,
  seed: 0.5,
  servings: 2,
  dates: [TODAY + DAY, TODAY + 2 * DAY],
  slots: ["lunch" as const],
  today: TODAY,
  diet: "omnivore" as const,
  avoids: [],
  ...overrides,
});

describe("router/planning/getDraft", () => {
  test("rejects an unauthenticated caller", async () => {
    const householdId = await seedHousehold();

    await expect(t.query(api.router.planning.getDraft.authed, args(householdId))).rejects.toThrow();
  });

  /** Membership is the authorization: the draft is scored against that household's cellar. */
  test("rejects a caller who is not a member of the household", async () => {
    const householdId = await seedHousehold();
    const outsiderId = await seedUser();

    await expect(
      t.withIdentity(asUser(outsiderId)).query(api.router.planning.getDraft.authed, args(householdId)),
    ).rejects.toThrow();
  });

  test("answers a member with one real recipe per plate", async () => {
    const householdId = await seedHousehold();
    const userId = await seedUser();
    await join(householdId, userId);
    const soupId = await seedRecipe("Soupe", 3_000_000_000, []);
    const saladId = await seedRecipe("Salade", 1_000_000_000, []);

    const week = await t.withIdentity(asUser(userId)).query(api.router.planning.getDraft.authed, args(householdId));

    expect(week).toHaveLength(2);
    expect(new Set(week.map((meal) => meal.recipeId))).toEqual(new Set([soupId, saladId]));
    expect(week.map((meal) => meal.date)).toEqual([TODAY + DAY, TODAY + 2 * DAY]);
    expect(week[0]!.ingredients[0]).toMatchObject({ amount: 200, unit: "g", covered: false });
  });

  test("never draws a recipe carrying an allergen the run avoids", async () => {
    const householdId = await seedHousehold();
    const userId = await seedUser();
    await join(householdId, userId);
    const soupId = await seedRecipe("Soupe", 3_000_000_000, []);
    await seedRecipe("Pain", 1_000_000_000, ["gluten"]);

    const week = await t
      .withIdentity(asUser(userId))
      .query(api.router.planning.getDraft.authed, args(householdId, { avoids: ["gluten"] }));

    expect(week.map((meal) => meal.recipeId)).toEqual([soupId, soupId]);
  });

  test("refuses a seek outside the nutrition vocabulary", async () => {
    const householdId = await seedHousehold();
    const userId = await seedUser();
    await join(householdId, userId);

    await expect(
      t.withIdentity(asUser(userId)).query(api.router.planning.getDraft.authed, {
        ...args(householdId),
        // The validator is the boundary; the type is bypassed to reach it.
        seeks: ["quick" as unknown as "high-protein"],
      }),
    ).rejects.toThrow();
  });

  test("refuses a request for more than a week", async () => {
    const householdId = await seedHousehold();
    const userId = await seedUser();
    await join(householdId, userId);

    await expect(
      t.withIdentity(asUser(userId)).query(api.router.planning.getDraft.authed, {
        ...args(householdId),
        dates: Array.from({ length: 8 }, (_, day) => TODAY + (day + 1) * DAY),
      }),
    ).rejects.toThrow();
  });

  /** The validator is built from `EQUIPMENTS`, so a word the vocabulary does not know never reaches the pool. */
  test("refuses an appliance outside the vocabulary", async () => {
    const householdId = await seedHousehold();
    const userId = await seedUser();
    await join(householdId, userId);

    await expect(
      t.withIdentity(asUser(userId)).query(api.router.planning.getDraft.authed, {
        ...args(householdId),
        // A type-level lie on purpose: the point is what the runtime validator does with it.
        equipments: ["airfryer" as "air fryer"],
      }),
    ).rejects.toThrow();
  });
});
