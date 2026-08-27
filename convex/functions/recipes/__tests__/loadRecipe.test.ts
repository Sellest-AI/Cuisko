import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import schema from "../../../schema";
import { loadRecipe } from "../loadRecipe";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

const seedRecipe = () =>
  t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Franck" });

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
});
