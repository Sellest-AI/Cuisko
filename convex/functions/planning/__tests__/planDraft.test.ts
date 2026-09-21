import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Id } from "@convex/_generated/dataModel";
import type { Equipment } from "@shared/equipments";
import type { MealSlot } from "@shared/mealSlots";
import type { NutritionPreference } from "@shared/preferences";

import schema from "../../../schema";
import { planDraft } from "../planDraft";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

beforeEach(() => {
  t = convexTest(schema, modules);
});

const DAY = 86_400_000;
const TODAY = 1_700_000_000_000;

const setup = () =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Franck" });
    const householdId = await ctx.db.insert("households", { name: "Home", inviteCode: "ABC", updatedAt: Date.now() });
    const ingredientId = await ctx.db.insert("ingredients", {
      name: { values: { fr: "Tomate" }, meta: {} },
      category: "VEGETABLE",
      emoji: "🍅",
      allergens: [],
      defaultUnit: "g",
      defaultQuantity: 500,
      nutrition: { calories: 10, protein: 1, fat: 1, carbohydrates: 1 },
      updatedAt: Date.now(),
    });
    const recipeId = await ctx.db.insert("recipes", {
      title: { values: { fr: "Salade de tomates" }, meta: {} },
      description: { values: { fr: "" }, meta: {} },
      instructions: { values: { fr: "" }, meta: {} },
      servings: 2,
      equipments: [],
      difficulty: 1,
      tags: [],
      cuisine: "french",
      timings: { cooking: 20 },
      search: { en: "", fr: "" },
      shuffleKey: 1_000_000_000,
      isVegan: true,
      isVegetarian: true,
      isPescatarian: true,
      isGlutenFree: true,
      isDairyFree: true,
      isNutFree: true,
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
    return { userId, householdId, ingredientId, recipeId };
  });

type Request = {
  seed?: number;
  startedAt?: number;
  servings?: number;
  dates?: number[];
  slots?: MealSlot[];
  equipments?: Equipment[];
  seeks?: NutritionPreference[];
};

const draft = (ids: { userId: Id<"users">; householdId: Id<"households"> }, request: Request = {}) =>
  t.run((ctx) =>
    planDraft(ctx, {
      ...ids,
      locale: "fr",
      seed: 0.5,
      servings: 2,
      dates: [TODAY + DAY],
      slots: ["lunch"],
      today: TODAY,
      diet: "omnivore",
      avoids: [],
      ...request,
    }),
  );

describe("functions/planning/planDraft", () => {
  test("shapes one plate per date and slot, named in the caller's locale", async () => {
    const ids = await setup();

    const week = await draft(ids, { dates: [TODAY + DAY, TODAY + 2 * DAY], slots: ["lunch", "dinner"] });

    expect(week).toHaveLength(4);
    expect(week.map(({ date, slot }) => [date, slot])).toEqual([
      [TODAY + DAY, "lunch"],
      [TODAY + DAY, "dinner"],
      [TODAY + 2 * DAY, "lunch"],
      [TODAY + 2 * DAY, "dinner"],
    ]);
    expect(week[0]).toMatchObject({ recipeId: ids.recipeId, title: "Salade de tomates", servings: 2 });
    expect(week[0]!.ingredients).toEqual([
      expect.objectContaining({ ingredientId: ids.ingredientId, name: "Tomate", amount: 200, unit: "g", covered: false }),
    ]);
  });

  test("marks a line covered when the cellar holds enough of it", async () => {
    const ids = await setup();
    await t.run((ctx) =>
      ctx.db.insert("cellarItems", {
        householdId: ids.householdId,
        ingredientId: ids.ingredientId,
        quantity: 500,
        unit: "g",
        updatedAt: Date.now(),
      }),
    );

    const [meal] = await draft(ids);

    expect(meal!.ingredients[0]!.covered).toBe(true);
  });

  /**
   * A recipe written while the user reviews the week lands in the pool's window and re-runs this
   * query; `startedAt` keeps the re-run from putting it in front of the plate already offered.
   */
  test("keeps the plate it offered when a recipe is written after the run started", async () => {
    const ids = await setup();
    const startedAt = Date.now() + 1;
    await new Promise((resolve) => setTimeout(resolve, 2));
    const latecomer = await t.run(async (ctx) => {
      const recipeId = await ctx.db.insert("recipes", {
        title: { values: { fr: "Tarte tardive" }, meta: {} },
        description: { values: { fr: "" }, meta: {} },
        instructions: { values: { fr: "" }, meta: {} },
        servings: 2,
        equipments: [],
        difficulty: 1,
        tags: [],
        cuisine: "french",
        timings: {},
        search: { en: "", fr: "" },
        // Ahead of the standing recipe in the wrapped window, so without the cut it is drawn first.
        shuffleKey: 500_000_000,
        isVegan: true,
        isVegetarian: true,
        isPescatarian: true,
        isGlutenFree: true,
        isDairyFree: true,
        isNutFree: true,
        updatedAt: Date.now(),
      });
      await ctx.db.insert("recipeIngredients", {
        recipeId,
        ingredientId: ids.ingredientId,
        position: 0,
        quantity: 200,
        unit: "g",
        updatedAt: Date.now(),
      });
      return recipeId;
    });

    expect((await draft(ids))[0]!.recipeId).toBe(latecomer);
    expect((await draft(ids, { startedAt }))[0]!.recipeId).toBe(ids.recipeId);
  });

  /** The kitchen reaches the pool: the one recipe needs an oven, and a kitchen without one plans nothing. */
  test("draws only recipes the kitchen can make", async () => {
    const ids = await setup();
    await t.run((ctx) => ctx.db.patch(ids.recipeId, { equipments: ["oven"] }));

    expect(await draft(ids, { equipments: ["microwave"] })).toEqual([]);
    expect(await draft(ids, { equipments: ["oven"] })).toHaveLength(1);
  });

  /** The fixture recipe carries no tag, so a seek that reaches the pool leaves nothing to plan from. */
  test("hands the run's seeks to the pool", async () => {
    const ids = await setup();

    expect(await draft(ids, { seeks: ["high-protein"] })).toEqual([]);
    expect(await draft(ids, { seeks: [] })).toHaveLength(1);
  });

  /** The recipe that lost the plate is offered on it, as a tile: an id, a title in the locale, no lines. */
  test("offers each plate its runners-up, named in the caller's locale", async () => {
    const ids = await setup();
    const soupId = await t.run(async (ctx) => {
      const recipe = await ctx.db.get(ids.recipeId);
      const { _id, _creationTime, ...fields } = recipe!;
      const soupId = await ctx.db.insert("recipes", {
        ...fields,
        title: { values: { fr: "Soupe de tomates" }, meta: {} },
        shuffleKey: 3_000_000_000,
      });
      await ctx.db.insert("recipeIngredients", {
        recipeId: soupId,
        ingredientId: ids.ingredientId,
        position: 0,
        quantity: 200,
        unit: "g",
        updatedAt: Date.now(),
      });
      return soupId;
    });

    const [meal] = await draft(ids);

    expect(meal!.recipeId).toBe(soupId);
    expect(meal!.alternatives).toEqual([{ recipeId: ids.recipeId, title: "Salade de tomates", imageUrl: undefined }]);
  });

  test("answers an empty week, not a throw, when there are no slots", async () => {
    const ids = await setup();

    expect(await draft(ids, { slots: [] })).toEqual([]);
  });

  /** Every factor of `dates × slots` is the client's, so each is bounded here. */
  test.each<[string, Request]>([
    ["more than a week", { dates: Array.from({ length: 8 }, (_, day) => TODAY + (day + 1) * DAY) }],
    ["a repeated date", { dates: [TODAY + DAY, TODAY + DAY] }],
    ["a repeated slot", { slots: ["lunch", "lunch"] }],
    ["no servings", { servings: 0 }],
    ["more servings than a plate is cooked for", { servings: 9 }],
    ["fractional servings", { servings: 1.5 }],
    ["NaN servings", { servings: Number.NaN }],
    ["a seed outside [0, 1)", { seed: 1 }],
  ])("refuses %s", async (_label, request) => {
    const ids = await setup();

    await expect(draft(ids, request)).rejects.toThrow();
  });
});
