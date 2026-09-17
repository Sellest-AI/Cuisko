import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Id } from "@convex/_generated/dataModel";

import schema from "../../../schema";
import { lastPlannedDate } from "../lastPlannedDate";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

const DAY = 86_400_000;
const TODAY = 1_700_000_000_000;

beforeEach(() => {
  t = convexTest(schema, modules);
});

const household = () =>
  t.run((ctx) => ctx.db.insert("households", { name: "Home", inviteCode: "ABC", updatedAt: Date.now() }));

/** One plate per date, inserted in the order given so the index and not insertion order is what answers. */
const seedPlates = (householdId: Id<"households">, dates: number[]) =>
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

describe("lastPlannedDate", () => {
  test("answers null for a household that has never kept a plate", async () => {
    const householdId = await household();

    expect(await t.run((ctx) => lastPlannedDate(ctx, householdId))).toBeNull();
  });

  test("answers the latest day, whatever order the plates were written in", async () => {
    const householdId = await household();
    await seedPlates(householdId, [TODAY + 3 * DAY, TODAY - DAY, TODAY + DAY]);

    expect(await t.run((ctx) => lastPlannedDate(ctx, householdId))).toBe(TODAY + 3 * DAY);
  });

  /** A day already lived is still the latest: the client, not the server, turns it into tomorrow. */
  test("answers a day in the past when that is all the household has", async () => {
    const householdId = await household();
    await seedPlates(householdId, [TODAY - 2 * DAY]);

    expect(await t.run((ctx) => lastPlannedDate(ctx, householdId))).toBe(TODAY - 2 * DAY);
  });

  test("ignores another household's plates", async () => {
    const householdId = await household();
    const otherId = await household();
    await seedPlates(otherId, [TODAY + 5 * DAY]);
    await seedPlates(householdId, [TODAY + DAY]);

    expect(await t.run((ctx) => lastPlannedDate(ctx, householdId))).toBe(TODAY + DAY);
  });
});
