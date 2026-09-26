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
      .filter(([path]) => path.startsWith("/convex/router/planning/getPaginated."))
      .map(([, load]) => load()),
  ),
);

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

const DAY = 86_400_000;
const TODAY = 1_700_000_000_000;
const FIRST_PAGE = { numItems: 2, cursor: null };

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
      status: "generated",
      isArchived: false,
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
    for (const date of dates)
      await ctx.db.insert("plannedMeals", {
        mealPlanId, householdId, recipeId, date, slot: "lunch", servings: 2, status: "planned", updatedAt: Date.now(),
      });
  });

describe("router/planning/getPaginated", () => {
  test("rejects an unauthenticated caller", async () => {
    const { householdId } = await seedMember();

    await expect(
      t.query(api.router.planning.getPaginated.authed, {
        householdId, locale: "fr", from: TODAY, direction: "after", paginationOpts: FIRST_PAGE,
      }),
    ).rejects.toThrow();
  });

  /** Membership is the authorization: a plan belongs to the household, not to whoever asks. */
  test("rejects a caller who is not a member of the household", async () => {
    const { householdId } = await seedMember();
    const outsiderId = await t.run((ctx) => ctx.db.insert("users", { name: "Outsider" }));

    await expect(
      t.withIdentity(asUser(outsiderId)).query(api.router.planning.getPaginated.authed, {
        householdId, locale: "fr", from: TODAY, direction: "after", paginationOpts: FIRST_PAGE,
      }),
    ).rejects.toThrow();
  });

  test("walks forward from the day, including it", async () => {
    const { userId, householdId } = await seedMember();
    await seedPlates(householdId, [TODAY + 2 * DAY, TODAY - DAY, TODAY, TODAY + DAY]);

    const result = await t.withIdentity(asUser(userId)).query(api.router.planning.getPaginated.authed, {
      householdId, locale: "fr", from: TODAY, direction: "after", paginationOpts: FIRST_PAGE,
    });

    expect(result.page.map((meal) => meal.date)).toEqual([TODAY, TODAY + DAY]);
    expect(result.isDone).toBe(false);
  });

  /** Newest first, so the page nearest the day comes back before the older history. */
  test("walks back from the day, excluding it", async () => {
    const { userId, householdId } = await seedMember();
    await seedPlates(householdId, [TODAY - 3 * DAY, TODAY - DAY, TODAY, TODAY - 2 * DAY]);

    const result = await t.withIdentity(asUser(userId)).query(api.router.planning.getPaginated.authed, {
      householdId, locale: "fr", from: TODAY, direction: "before", paginationOpts: FIRST_PAGE,
    });

    expect(result.page.map((meal) => meal.date)).toEqual([TODAY - DAY, TODAY - 2 * DAY]);
  });

  test("never answers another household's plates", async () => {
    const { userId, householdId } = await seedMember();
    const other = await seedMember();
    await seedPlates(other.householdId, [TODAY]);

    const result = await t.withIdentity(asUser(userId)).query(api.router.planning.getPaginated.authed, {
      householdId, locale: "fr", from: TODAY, direction: "after", paginationOpts: FIRST_PAGE,
    });

    expect(result.page).toEqual([]);
  });
});
