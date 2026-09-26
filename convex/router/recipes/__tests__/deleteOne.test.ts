import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";

import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** Imports the module under test before any test is timed — see media/images/__tests__/deleteOne.test.ts. */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/recipes/deleteOne."))
      .map(([, load]) => load()),
  ),
);

const imageRow = (url: string) => ({
  hasAlpha: false,
  key: `public/${url}`,
  url,
  width: 1024,
  height: 1024,
  size: 500_000,
  mimeType: "image/webp",
  tags: ["IMAGE" as const],
  updatedAt: Date.now(),
});

const recipeRow = (userId?: Id<"users">, coverImageId?: Id<"images">) => ({
  title: { values: { en: "Tiramisu", fr: "Tiramisu" }, meta: {} },
  description: { values: {}, meta: {} },
  instructions: { values: {}, meta: {} },
  servings: 4,
  equipments: [],
  difficulty: 2 as const,
  status: "generated" as const,
  isArchived: false,
  userId,
  coverImageId,
  tags: [],
  cuisine: "italian" as const,
  timings: {},
  search: { en: "", fr: "" },
  isVegan: false,
  isVegetarian: false,
  isPescatarian: false,
  isGlutenFree: false,
  isDairyFree: false,
  isNutFree: false,
  updatedAt: Date.now(),
});

/**
 * The mutation exists so a catalog recipe is never deleted bare from the dashboard. What it has
 * to prove is therefore the fan-out — every row a bare delete would orphan — and the two refusals.
 */
describe("router/recipes/deleteOne", () => {
  test("removes the recipe, its lines and favorites, and schedules its image tree", async () => {
    const t = convexTest(schema, modules);

    const { recipeId, ingredientId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { name: "Ana" });
      const coverImageId = await ctx.db.insert("images", imageRow("cover.webp"));
      const recipeId = await ctx.db.insert("recipes", recipeRow(undefined, coverImageId));
      const ingredientId = await ctx.db.insert("ingredients", {
        name: { values: { en: "Mascarpone", fr: "Mascarpone" }, meta: {} },
        emoji: "🧀",
        category: "DAIRY",
        defaultUnit: "g",
        defaultQuantity: 250,
        nutrition: { calories: 429, protein: 4.8, fat: 44, carbohydrates: 4.8 },
        updatedAt: Date.now(),
      });
      await ctx.db.insert("recipeIngredients", {
        recipeId,
        ingredientId,
        position: 0,
        quantity: 250,
        unit: "g",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("recipeFavorites", { userId, recipeId });

      return { recipeId, ingredientId };
    });

    const result = await t.mutation(internal.router.recipes.deleteOne._internal, { recipeId });

    expect(result).toEqual({ deleted: { en: "Tiramisu", fr: "Tiramisu" } });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(recipeId)).toBeNull();
      expect(await ctx.db.query("recipeIngredients").collect()).toEqual([]);
      expect(await ctx.db.query("recipeFavorites").collect()).toEqual([]);
      // The ingredient itself is catalog data other recipes share; it stays.
      expect(await ctx.db.get(ingredientId)).not.toBeNull();
      // The image tree goes through the media delete, which removes the files first, so it is
      // scheduled rather than done in this transaction.
      const scheduled = await ctx.db.system.query("_scheduled_functions").collect();
      expect(scheduled).toHaveLength(1);
    });
  });

  test("refuses a recipe a cook wrote, so a pasted id cannot delete someone's own recipe", async () => {
    const t = convexTest(schema, modules);

    const recipeId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { name: "Ana" });

      return ctx.db.insert("recipes", recipeRow(userId));
    });

    await expect(t.mutation(internal.router.recipes.deleteOne._internal, { recipeId })).rejects.toThrow(
      /catalog/,
    );
    await t.run(async (ctx) => {
      expect(await ctx.db.get(recipeId)).not.toBeNull();
    });
  });

  test("refuses an id that no longer exists, rather than reporting a delete that did nothing", async () => {
    const t = convexTest(schema, modules);

    const recipeId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("recipes", recipeRow());
      await ctx.db.delete(id);

      return id;
    });

    await expect(t.mutation(internal.router.recipes.deleteOne._internal, { recipeId })).rejects.toThrow(
      /not found/i,
    );
  });
});
