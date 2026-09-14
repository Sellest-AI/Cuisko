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
      .filter(([path]) => path.startsWith("/convex/router/planning/getOne."))
      .map(([, load]) => load()),
  ),
);

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

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

/** A plan holding one plate of a catalog recipe, cooked for three. */
const seedPlate = (householdId: Id<"households">) =>
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
      startDate: TODAY,
      days: 1,
      slots: ["lunch"],
      people: 2,
      seed: 0.5,
      updatedAt: Date.now(),
    });
    const mealId = await ctx.db.insert("plannedMeals", {
      mealPlanId, householdId, recipeId, date: TODAY, slot: "lunch", servings: 3, status: "planned", updatedAt: Date.now(),
    });
    return { recipeId, mealId };
  });

const getOne = (userId: Id<"users">, householdId: Id<"households">, mealId: Id<"plannedMeals">) =>
  t.withIdentity(asUser(userId)).query(api.router.planning.getOne.authed, { householdId, locale: "fr", mealId });

describe("router/planning/getOne", () => {
  test("rejects an unauthenticated caller", async () => {
    const { householdId } = await seedMember();
    const { mealId } = await seedPlate(householdId);

    await expect(
      t.query(api.router.planning.getOne.authed, { householdId, locale: "fr", mealId }),
    ).rejects.toThrow();
  });

  /** Membership is the authorization: a plan belongs to the household, not to whoever asks. */
  test("rejects a caller who is not a member of the household", async () => {
    const { householdId } = await seedMember();
    const outsiderId = await t.run((ctx) => ctx.db.insert("users", { name: "Outsider" }));
    const { mealId } = await seedPlate(householdId);

    await expect(getOne(outsiderId, householdId, mealId)).rejects.toThrow();
  });

  /** A member of one household naming a plate of another: the id is not the key, the household is. */
  test("rejects a plate that belongs to another household", async () => {
    const { householdId } = await seedMember();
    const { mealId } = await seedPlate(householdId);
    const elsewhere = await seedMember();

    await expect(getOne(elsewhere.userId, elsewhere.householdId, mealId)).rejects.toThrow();
  });

  test("answers the plate as the lists draw it", async () => {
    const { userId, householdId } = await seedMember();
    const { recipeId, mealId } = await seedPlate(householdId);

    const meal = await getOne(userId, householdId, mealId);

    expect(meal).toMatchObject({
      id: mealId,
      date: TODAY,
      slot: "lunch",
      servings: 3,
      status: "ready",
      recipe: { id: recipeId, title: "Soupe" },
    });
  });

  /** A stale link, or a plate removed while the sheet was open: an answer, not a failure. */
  test("answers null for a plate that is gone", async () => {
    const { userId, householdId } = await seedMember();
    const { mealId } = await seedPlate(householdId);
    await t.run((ctx) => ctx.db.delete(mealId));

    expect(await getOne(userId, householdId, mealId)).toBeNull();
  });
});
