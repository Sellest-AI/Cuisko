import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { cascadeDelete } from "../cascade";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

const insertImage = (url: string) =>
  t.run((ctx) =>
    ctx.db.insert("images", {
      hasAlpha: false,
      key: `public/${url}`,
      url,
      width: 768,
      height: 512,
      size: 100_000,
      mimeType: "image/webp",
      tags: ["IMAGE"],
      updatedAt: Date.now(),
    }),
  );

const insertRecipe = (
  fields: { userId?: Id<"users">; coverImageId?: Id<"images">; plateImageId?: Id<"images"> } = {},
) =>
  t.run((ctx) =>
    ctx.db.insert("recipes", {
      title: { values: { fr: "Soupe à l'oignon" }, meta: {} },
      description: { values: { fr: "Une soupe d'hiver." }, meta: {} },
      instructions: { values: { fr: "Base\n- Émincer les oignons." }, meta: {} },
      servings: 4,
      equipments: [],
      difficulty: 2,
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
      ...fields,
      updatedAt: Date.now(),
    }),
  );

const insertUser = () => t.run((ctx) => ctx.db.insert("users", { name: "Franck" }));

/** The image ids queued for deletion, in the order they were scheduled. */
const scheduledDeletions = async () => {
  const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return jobs.map((job) => (job.args[0] as { imageId: Id<"images"> }).imageId);
};

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("cascadeDelete", () => {
  describe("delete-image-tree", () => {
    test("queues both of a deleted recipe's photos for deletion", async () => {
      const coverImageId = await insertImage("cover.webp");
      const plateImageId = await insertImage("plate.webp");
      const recipeId = await insertRecipe({ coverImageId, plateImageId });

      await t.run((ctx) => cascadeDelete(ctx, "recipes", recipeId));

      expect(await t.run((ctx) => ctx.db.get(recipeId))).toBeNull();
      expect(await scheduledDeletions()).toEqual([coverImageId, plateImageId]);
    });

    test("schedules nothing for a recipe with no photos", async () => {
      const recipeId = await insertRecipe();

      await t.run((ctx) => cascadeDelete(ctx, "recipes", recipeId));

      expect(await t.run((ctx) => ctx.db.get(recipeId))).toBeNull();
      expect(await scheduledDeletions()).toEqual([]);
    });
  });

  test("deletes the rows that reference the deleted row", async () => {
    const userId = await insertUser();
    const recipeId = await insertRecipe();
    await t.run((ctx) => ctx.db.insert("recipeFavorites", { userId, recipeId }));

    await t.run((ctx) => cascadeDelete(ctx, "recipes", recipeId));

    expect(await t.run((ctx) => ctx.db.query("recipeFavorites").collect())).toEqual([]);
  });

  /**
   * A recipe outlives its author. Pinned because the rule used to be a delete, and a delete would
   * also have queued the recipe's photos — detaching must leave both the row and its images alone.
   */
  test("detaches a recipe from its deleted author and keeps its photos", async () => {
    const userId = await insertUser();
    const coverImageId = await insertImage("cover.webp");
    const recipeId = await insertRecipe({ userId, coverImageId });

    await t.run((ctx) => cascadeDelete(ctx, "users", userId));

    const recipe = await t.run((ctx) => ctx.db.get(recipeId));
    expect(recipe).not.toBeNull();
    expect(recipe?.userId).toBeUndefined();
    expect(recipe?.coverImageId).toBe(coverImageId);
    expect(await scheduledDeletions()).toEqual([]);
  });

  test("is a no-op for a row that is already gone", async () => {
    const recipeId = await insertRecipe();
    await t.run((ctx) => ctx.db.delete(recipeId));

    await expect(t.run((ctx) => cascadeDelete(ctx, "recipes", recipeId))).resolves.toBeNull();
    expect(await scheduledDeletions()).toEqual([]);
  });
});
