import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import { api } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

let t: ReturnType<typeof convexTest>;

const seedUser = (name: string) =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name });
    await ctx.db.insert("usersExtended", { userId, role: "USER", updatedAt: Date.now() });

    return userId;
  });

const seedRecipe = (userId: Id<"users">) =>
  t.run((ctx) =>
    ctx.db.insert("recipes", {
      title: { values: { en: "Onion soup", fr: "Soupe à l'oignon" }, meta: {} },
      description: { values: { en: "A winter soup.", fr: "Une soupe d'hiver." }, meta: {} },
      instructions: {
        values: { en: "Base\n- Slice the onions.\n- Sweat them.", fr: "Base\n- Émincer." },
        meta: {},
      },
      servings: 4,
      equipments: ["oven"],
      difficulty: 2,
      userId,
      tags: ["soup"],
      cuisine: "french",
      timings: { preparation: 15, cooking: 30 },
      search: { en: "onion", fr: "oignon" },
      isVegan: false,
      isVegetarian: true,
      isPescatarian: false,
      isGlutenFree: true,
      isDairyFree: false,
      isNutFree: true,
      updatedAt: Date.now(),
    }),
  );

/** Two lines, inserted out of order, so `position` is the only thing that can put them right. */
const seedLines = (recipeId: Id<"recipes">) =>
  t.run(async (ctx) => {
    const onionId = await ctx.db.insert("ingredients", {
      name: { values: { en: "Onion", fr: "Oignon" }, meta: {} },
      category: "VEGETABLE",
      defaultUnit: "pcs",
      defaultQuantity: 1,
      nutrition: { calories: 40, protein: 1, fat: 0, carbohydrates: 9 },
      updatedAt: Date.now(),
    });
    const butterId = await ctx.db.insert("ingredients", {
      name: { values: { en: "Butter", fr: "Beurre" }, meta: {} },
      category: "DAIRY",
      defaultUnit: "g",
      defaultQuantity: 10,
      nutrition: { calories: 717, protein: 1, fat: 81, carbohydrates: 0 },
      updatedAt: Date.now(),
    });

    await ctx.db.insert("recipeIngredients", {
      recipeId,
      ingredientId: butterId,
      position: 1,
      quantity: 30,
      unit: "g",
      updatedAt: Date.now(),
    });
    await ctx.db.insert("recipeIngredients", {
      recipeId,
      ingredientId: onionId,
      position: 0,
      quantity: 4,
      unit: "pcs",
      updatedAt: Date.now(),
    });
  });

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("router/recipes/getOne", () => {
  test("rejects an unauthenticated caller", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    await expect(
      t.query(api.router.recipes.getOne.authed, { id: recipeId, locale: "en" }),
    ).rejects.toThrow();
  });

  /**
   * The check `ownedQueryI18n` exists for. The id is a valid recipe and the caller is a valid user
   * — the only thing wrong is that it is not theirs, which is exactly the request a hand-written
   * ownership check forgets to refuse.
   */
  test("refuses another cook's recipe, by id", async () => {
    const ownerId = await seedUser("Franck");
    const strangerId = await seedUser("Stranger");
    const recipeId = await seedRecipe(ownerId);

    await expect(
      t
        .withIdentity(asUser(strangerId))
        .query(api.router.recipes.getOne.authed, { id: recipeId, locale: "en" }),
    ).rejects.toThrow();
  });

  test("gives the owner their recipe", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    const recipe = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.getOne.authed, { id: recipeId, locale: "en" });

    expect(recipe.title).toBe("Onion soup");
    expect(recipe.description).toBe("A winter soup.");
    expect(recipe.servings).toBe(4);
    expect(recipe.difficulty).toBe(2);
    expect(recipe.cuisine).toBe("french");
    expect(recipe.tags).toEqual(["soup"]);
    expect(recipe.equipments).toEqual(["oven"]);
    /** The card's rule, inherited rather than restated: the three timings arrive as one number. */
    expect(recipe.minutes).toBe(45);
  });

  test("answers in the locale it was asked in", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    const recipe = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.getOne.authed, { id: recipeId, locale: "fr" });

    expect(recipe.title).toBe("Soupe à l'oignon");
    expect(recipe.description).toBe("Une soupe d'hiver.");
  });

  /** The stored text is a serialized form; a page needs the groups, not the blob. */
  test("hands back parsed instruction groups rather than the stored text", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    const recipe = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.getOne.authed, { id: recipeId, locale: "en" });

    expect(recipe.instructions).toEqual([
      { title: "Base", steps: ["Slice the onions.", "Sweat them."] },
    ]);
  });

  test("names each line in the caller's locale, in the recipe's own order", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);
    await seedLines(recipeId);

    const caller = t.withIdentity(asUser(userId));

    const english = await caller.query(api.router.recipes.getOne.authed, {
      id: recipeId,
      locale: "en",
    });

    expect(english.ingredients).toEqual([
      { name: "Onion", quantity: 4, unit: "pcs" },
      { name: "Butter", quantity: 30, unit: "g" },
    ]);

    const french = await caller.query(api.router.recipes.getOne.authed, {
      id: recipeId,
      locale: "fr",
    });

    expect(french.ingredients.map((line) => line.name)).toEqual(["Oignon", "Beurre"]);
  });

  /** The blob is for the index, not for anyone downstream — several kilobytes of it per recipe. */
  test("does not ship the search blob", async () => {
    const userId = await seedUser("Franck");
    const recipeId = await seedRecipe(userId);

    const recipe = await t
      .withIdentity(asUser(userId))
      .query(api.router.recipes.getOne.authed, { id: recipeId, locale: "en" });

    expect(recipe).not.toHaveProperty("search");
    expect(recipe).not.toHaveProperty("userId");
  });
});
