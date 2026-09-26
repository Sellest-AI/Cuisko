import { convexTest } from "convex-test";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";

import type { Equipment } from "@shared/equipments";
import type { NutritionPreference } from "@shared/preferences";
import type { Tag } from "@shared/tags";

import type { Id } from "../../../_generated/dataModel";
import { api } from "../../../_generated/api";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** Imports the module under test before any test is timed — see router/preferences/__tests__/getPlanningSeed.test.ts. */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/planning/getWeekIdeas."))
      .map(([, load]) => load()),
  ),
);

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

const WEEK_KEY = "2026-09-14";

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

const seedPreferences = (
  userId: Id<"users">,
  diet: "vegan" | "omnivore",
  avoids: ("gluten" | "milk")[],
  seeks: NutritionPreference[] = [],
) => t.run((ctx) => ctx.db.insert("userPreferences", { userId, diet, avoids, seeks, updatedAt: Date.now() }));

type RecipeOptions = {
  shuffleKey: number;
  /** `null` seeds an ingredient row that was never classified — `undefined` would take the default. */
  allergens?: ("gluten" | "milk")[] | null;
  isVegan?: boolean;
  userId?: Id<"users">;
  /** The alternatives the recipe can be made with; empty is "pans and a knife". */
  equipments?: Equipment[];
  tags?: Tag[];
};

/** A recipe of one line. Catalog when `userId` is unset, the caller's own otherwise. */
const seedRecipe = (
  title: string,
  { shuffleKey, allergens = [], isVegan = true, userId, equipments = [], tags = [] }: RecipeOptions,
) =>
  t.run(async (ctx) => {
    const ingredientId = await ctx.db.insert("ingredients", {
      name: { values: { fr: title }, meta: {} },
      category: "VEGETABLE",
      emoji: "🍅",
      allergens: allergens ?? undefined,
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
      equipments,
      difficulty: 1,
      tags,
      cuisine: "french",
      timings: { cooking: 20 },
      search: { en: "", fr: "" },
      shuffleKey,
      isVegan,
      isVegetarian: isVegan,
      isPescatarian: isVegan,
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
    return recipeId;
  });

const seedMember = async () => {
  const householdId = await seedHousehold();
  const userId = await seedUser();
  await join(householdId, userId);
  return { householdId, userId };
};

const ideasFor = (userId: Id<"users">, householdId: Id<"households">, weekKey = WEEK_KEY) =>
  t.withIdentity(asUser(userId)).query(api.router.planning.getWeekIdeas.authed, { householdId, locale: "fr", weekKey });

describe("router/planning/getWeekIdeas", () => {
  test("rejects an unauthenticated caller", async () => {
    const householdId = await seedHousehold();

    await expect(
      t.query(api.router.planning.getWeekIdeas.authed, { householdId, locale: "fr", weekKey: WEEK_KEY }),
    ).rejects.toThrow();
  });

  /** Membership is the authorization: the picks are drawn against that household's preferences. */
  test("rejects a caller who is not a member of the household", async () => {
    const householdId = await seedHousehold();
    const outsiderId = await seedUser();

    await expect(ideasFor(outsiderId, householdId)).rejects.toThrow();
  });

  test("answers real cards, in the caller's language", async () => {
    const { householdId, userId } = await seedMember();
    const soupId = await seedRecipe("Soupe", { shuffleKey: 1_000_000_000 });

    const ideas = await ideasFor(userId, householdId);

    expect(ideas).toHaveLength(1);
    expect(ideas[0]).toMatchObject({ id: soupId, title: "Soupe", cuisine: "french", minutes: 20 });
  });

  /** Diet is read from the stored row, never from the client: a vegan household never sees meat. */
  test("filters on the household's diet", async () => {
    const { householdId, userId } = await seedMember();
    await seedPreferences(userId, "vegan", []);
    const soupId = await seedRecipe("Soupe", { shuffleKey: 1_000_000_000 });
    await seedRecipe("Steak", { shuffleKey: 2_000_000_000, isVegan: false });

    const ideas = await ideasFor(userId, householdId);

    expect(ideas.map((card) => card.id)).toEqual([soupId]);
  });

  /**
   * Allergens are aggregated across the whole household: the caller eats anything, a housemate
   * avoids gluten, and the shelf must not suggest what the planner would reject for the table.
   * An unclassified ingredient is unknown, and unknown means excluded once anything is avoided.
   */
  test("filters on every member's allergens, and drops unclassified ingredients", async () => {
    const { householdId, userId } = await seedMember();
    const housemateId = await seedUser();
    await join(householdId, housemateId);
    await seedPreferences(housemateId, "omnivore", ["gluten"]);
    const soupId = await seedRecipe("Soupe", { shuffleKey: 1_000_000_000 });
    await seedRecipe("Pain", { shuffleKey: 2_000_000_000, allergens: ["gluten"] });
    await seedRecipe("Mystère", { shuffleKey: 3_000_000_000, allergens: null });

    const ideas = await ideasFor(userId, householdId);

    expect(ideas.map((card) => card.id)).toEqual([soupId]);
  });

  /**
   * The kitchen is the household's row, not a member's: a shelf must not suggest a roast to a
   * kitchen without an oven. A recipe needing nothing passes, and a household never asked (the
   * column unset) is not filtered at all — the shelf it had before it answered.
   */
  test("filters on the household's stored kitchen, and only once it has answered", async () => {
    const { householdId, userId } = await seedMember();
    const roastId = await seedRecipe("Rôti", { shuffleKey: 1_000_000_000, equipments: ["oven"] });
    const soupId = await seedRecipe("Soupe", { shuffleKey: 2_000_000_000 });

    expect((await ideasFor(userId, householdId)).map((card) => card.id)).toEqual([roastId, soupId]);

    await t.run((ctx) => ctx.db.patch(householdId, { equipments: ["microwave"] }));

    expect((await ideasFor(userId, householdId)).map((card) => card.id)).toEqual([soupId]);
  });

  /**
   * `seeks` is the one preference that is never aggregated: the shelf honours the caller's own and
   * ignores a housemate's, exactly as the tunnel seeds the focus step from `mine` alone.
   */
  test("filters on the caller's own seeks, never a housemate's", async () => {
    const { householdId, userId } = await seedMember();
    const housemateId = await seedUser();
    await join(householdId, housemateId);
    await seedPreferences(userId, "omnivore", [], ["high-protein"]);
    await seedPreferences(housemateId, "omnivore", [], ["low-calorie"]);
    const leanId = await seedRecipe("Poulet", { shuffleKey: 1_000_000_000, tags: ["high-protein"] });
    await seedRecipe("Soupe", { shuffleKey: 2_000_000_000, tags: ["low-calorie"] });
    await seedRecipe("Mystère", { shuffleKey: 3_000_000_000 });

    const ideas = await ideasFor(userId, householdId);

    expect(ideas.map((card) => card.id)).toEqual([leanId]);
  });

  /** The week is the seed: two visits in one week draw the same picks in the same order. */
  test("answers the same order for the same week key", async () => {
    const { householdId, userId } = await seedMember();
    for (const [index, title] of ["A", "B", "C", "D", "E"].entries())
      await seedRecipe(title, { shuffleKey: (index + 1) * 700_000_000 });

    const first = await ideasFor(userId, householdId);
    const second = await ideasFor(userId, householdId);

    expect(first.map((card) => card.id)).toEqual(second.map((card) => card.id));
  });

  test("fills a short catalog with the caller's own qualifying recipe", async () => {
    const { householdId, userId } = await seedMember();
    const soupId = await seedRecipe("Soupe", { shuffleKey: 1_000_000_000 });
    const mineId = await seedRecipe("Ma tarte", { shuffleKey: 2_000_000_000, userId });

    const ideas = await ideasFor(userId, householdId);

    expect(new Set(ideas.map((card) => card.id))).toEqual(new Set([soupId, mineId]));
  });

  test("answers exactly six when more qualify", async () => {
    const { householdId, userId } = await seedMember();
    for (const [index, title] of ["A", "B", "C", "D", "E", "F", "G", "H"].entries())
      await seedRecipe(title, { shuffleKey: (index + 1) * 450_000_000 });

    const ideas = await ideasFor(userId, householdId);

    expect(ideas).toHaveLength(6);
  });
});
