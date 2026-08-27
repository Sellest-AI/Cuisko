import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import { NO_EMOJI } from "@shared/ingredients";

import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";
import { loadRecipe } from "../loadRecipe";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

const seedRecipe = ({ chef }: { chef?: string | null } = { chef: "Franck" }) =>
  t.run(async (ctx) => {
    const userId =
      chef === null ? undefined : await ctx.db.insert("users", chef ? { name: chef } : {});

    return ctx.db.insert("recipes", {
      title: { values: { en: "Onion soup" }, meta: {} },
      description: { values: { en: "A winter soup." }, meta: {} },
      instructions: { values: { en: "Base\n- Slice the onions." }, meta: {} },
      servings: 4,
      equipments: [],
      difficulty: 2,
      userId,
      tags: [],
      cuisine: "french",
      timings: { preparation: 15 },
      search: { en: "", fr: "" },
      isVegan: false,
      isVegetarian: true,
      isPescatarian: false,
      isGlutenFree: true,
      isDairyFree: false,
      isNutFree: true,
      updatedAt: Date.now(),
    });
  });

/**
 * One line of the recipe, with the catalog row behind it.
 *
 * `gramsPerPiece` is what lets a `pcs` line reach grams, so it is the switch every nutrition test
 * here flips: an ingredient without it is a line `toGrams` refuses, which is the case the refusals
 * below are about.
 */
const seedLine = (
  recipeId: Id<"recipes">,
  ingredient: {
    name: string;
    category: "VEGETABLE" | "DAIRY";
    emoji?: string;
    gramsPerPiece?: number;
  },
  { position, quantity }: { position: number; quantity: number },
) =>
  t.run(async (ctx) => {
    const ingredientId = await ctx.db.insert("ingredients", {
      name: { values: { en: ingredient.name }, meta: {} },
      category: ingredient.category,
      defaultUnit: "pcs",
      defaultQuantity: 1,
      nutrition: { calories: 100, protein: 10, fat: 5, carbohydrates: 20 },
      updatedAt: Date.now(),
      ...(ingredient.emoji && { emoji: ingredient.emoji }),
      ...(ingredient.gramsPerPiece !== undefined && { gramsPerPiece: ingredient.gramsPerPiece }),
    });

    await ctx.db.insert("recipeIngredients", {
      recipeId,
      ingredientId,
      position,
      quantity,
      unit: "pcs",
      updatedAt: Date.now(),
    });
  });

beforeEach(() => {
  t = convexTest(schema, modules);
});

/**
 * `loadRecipe` takes the document or its id: `ownedQuery*` already holds the row it loaded to prove
 * ownership, while an internal action or a scheduled job holds only an id. What is pinned here is
 * that the choice stays a convenience — the two branches must not become two answers.
 *
 * Neither branch checks ownership, and nothing here implies one does. That belongs to the router
 * builder; see `router/recipes/__tests__/getOne.test.ts` for where it is asserted.
 */
describe("functions/recipes/loadRecipe", () => {
  test("resolves the same recipe from an id as from the document", async () => {
    const recipeId = await seedRecipe();

    const [fromId, fromDoc] = await t.run(async (ctx) => [
      await loadRecipe(ctx, { recipe: recipeId, locale: "en" }),
      await loadRecipe(ctx, { recipe: (await ctx.db.get(recipeId))!, locale: "en" }),
    ]);

    expect(fromId).toEqual(fromDoc);
    expect(fromId.title).toBe("Onion soup");
  });

  test("refuses an id that names no recipe", async () => {
    const recipeId = await seedRecipe();
    await t.run((ctx) => ctx.db.delete(recipeId));

    await expect(
      t.run((ctx) => loadRecipe(ctx, { recipe: recipeId, locale: "en" })),
    ).rejects.toThrow();
  });

  /**
   * A line whose catalog row is gone cannot be named. The cascade should make this unreachable, so
   * what is pinned is the behaviour if it ever is: one line fewer, not a quantity with no name.
   */
  test("drops a line whose ingredient no longer exists", async () => {
    const recipeId = await seedRecipe();

    await t.run(async (ctx) => {
      const ingredientId = await ctx.db.insert("ingredients", {
        name: { values: { en: "Onion" }, meta: {} },
        category: "VEGETABLE",
        defaultUnit: "pcs",
        defaultQuantity: 1,
        nutrition: { calories: 40, protein: 1, fat: 0, carbohydrates: 9 },
        updatedAt: Date.now(),
      });

      await ctx.db.insert("recipeIngredients", {
        recipeId,
        ingredientId,
        position: 0,
        quantity: 4,
        unit: "pcs",
        updatedAt: Date.now(),
      });

      await ctx.db.delete(ingredientId);
    });

    const recipe = await t.run((ctx) => loadRecipe(ctx, { recipe: recipeId, locale: "en" }));

    expect(recipe.ingredients).toEqual([]);
  });

  /**
   * The emoji column is still optional, on rows written before it existed. What is pinned is that
   * the fallback happens here rather than on every screen that draws a tile — a line always has
   * something to show.
   */
  test("falls back to the placeholder emoji when the catalog row carries none", async () => {
    const recipeId = await seedRecipe();
    await seedLine(recipeId, { name: "Onion", category: "VEGETABLE" }, { position: 0, quantity: 2 });
    await seedLine(
      recipeId,
      { name: "Butter", category: "DAIRY", emoji: "🧈" },
      { position: 1, quantity: 1 },
    );

    const recipe = await t.run((ctx) => loadRecipe(ctx, { recipe: recipeId, locale: "en" }));

    expect(recipe.ingredients.map((line) => line.emoji)).toEqual([NO_EMOJI, "🧈"]);
  });

  /** The stored key, not a heading — the screen groups by it and owns the words and the order. */
  test("carries each line's category, in position order", async () => {
    const recipeId = await seedRecipe();
    await seedLine(recipeId, { name: "Butter", category: "DAIRY" }, { position: 1, quantity: 1 });
    await seedLine(recipeId, { name: "Onion", category: "VEGETABLE" }, { position: 0, quantity: 2 });

    const recipe = await t.run((ctx) => loadRecipe(ctx, { recipe: recipeId, locale: "en" }));

    expect(recipe.ingredients.map((line) => [line.name, line.category])).toEqual([
      ["Onion", "VEGETABLE"],
      ["Butter", "DAIRY"],
    ]);
  });

  /**
   * Both halves of the same promise: a recipe every line of which can be weighed reports its
   * macros, and one with a single unweighable line reports none at all rather than a total that
   * silently leaves that ingredient out.
   */
  test("totals the recipe only when every line can be weighed", async () => {
    const weighable = await seedRecipe();
    await seedLine(
      weighable,
      { name: "Onion", category: "VEGETABLE", gramsPerPiece: 100 },
      { position: 0, quantity: 2 },
    );

    const totalled = await t.run((ctx) => loadRecipe(ctx, { recipe: weighable, locale: "en" }));

    // 2 pieces × 100 g, at 100 kcal per 100 g, over the 4 servings the recipe is written for.
    expect(totalled.nutrition?.grams).toBe(200);
    expect(totalled.nutrition?.perServing.calories).toBe(50);

    const partial = await seedRecipe();
    await seedLine(
      partial,
      { name: "Onion", category: "VEGETABLE", gramsPerPiece: 100 },
      { position: 0, quantity: 2 },
    );
    await seedLine(partial, { name: "Butter", category: "DAIRY" }, { position: 1, quantity: 1 });

    const unweighable = await t.run((ctx) => loadRecipe(ctx, { recipe: partial, locale: "en" }));

    expect(unweighable.nutrition).toBeUndefined();
  });

  /** A recipe with no lines has no nutrition to report, and zero is not the answer. */
  test("reports no nutrition for a recipe with no lines", async () => {
    const recipeId = await seedRecipe();

    const recipe = await t.run((ctx) => loadRecipe(ctx, { recipe: recipeId, locale: "en" }));

    expect(recipe.nutrition).toBeUndefined();
  });

  /** The timings stay unsummed beside the total the card already carries. */
  test("carries the timings breakdown as well as their sum", async () => {
    const recipeId = await seedRecipe();

    const recipe = await t.run((ctx) => loadRecipe(ctx, { recipe: recipeId, locale: "en" }));

    expect(recipe.timings).toEqual({ preparation: 15 });
    expect(recipe.minutes).toBe(15);
  });

  /**
   * Three ways to have no chef, and all of them are the same absence: the screen decides what an
   * uncredited recipe looks like, so nothing here invents a name for it.
   */
  test("credits the owner, and nobody when there is no name to credit", async () => {
    const named = await seedRecipe();
    const nameless = await seedRecipe({ chef: undefined });
    const ownerless = await seedRecipe({ chef: null });

    const [withChef, withoutName, withoutOwner] = await t.run(async (ctx) => [
      await loadRecipe(ctx, { recipe: named, locale: "en" }),
      await loadRecipe(ctx, { recipe: nameless, locale: "en" }),
      await loadRecipe(ctx, { recipe: ownerless, locale: "en" }),
    ]);

    expect(withChef.chef).toEqual({ name: "Franck" });
    expect(withoutName.chef).toBeUndefined();
    expect(withoutOwner.chef).toBeUndefined();
  });
});
