import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import { insertTestRecipe } from "@convex/functions/recipes/__tests__/recipes.fixtures";

import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";
import { cascadeDelete } from "../../cascade";
import { replaceRecipeImages } from "../recipeImages";

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

const insertRecipe = (images: { coverImageId?: Id<"images">; plateImageId?: Id<"images"> } = {}) =>
  t.run((ctx) =>
    insertTestRecipe(ctx.db, {
      title: { values: { fr: "Soupe à l'oignon" }, meta: {} },
      description: { values: { fr: "Une soupe d'hiver." }, meta: {} },
      instructions: { values: { fr: "Base\n- Émincer les oignons." }, meta: {} },
      servings: 4,
      difficulty: 2,
      timings: { preparation: 15 },
      isVegetarian: true,
      isGlutenFree: true,
      isNutFree: true,
      ...images,
      updatedAt: 0,
    }),
  );

/** The image ids queued for deletion, in the order they were scheduled. */
const scheduledDeletions = async () => {
  const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return jobs.map((job) => (job.args[0] as { imageId: Id<"images"> }).imageId);
};

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("replaceRecipeImages", () => {
  test("sets both photos on a recipe that has none, and deletes nothing", async () => {
    const recipeId = await insertRecipe();
    const coverImageId = await insertImage("cover.webp");
    const plateImageId = await insertImage("plate.webp");

    await t.run((ctx) => replaceRecipeImages(ctx, { recipeId, coverImageId, plateImageId }));

    const recipe = await t.run((ctx) => ctx.db.get(recipeId));
    expect(recipe?.coverImageId).toBe(coverImageId);
    expect(recipe?.plateImageId).toBe(plateImageId);
    expect(recipe?.updatedAt).toBeGreaterThan(0);
    expect(await scheduledDeletions()).toEqual([]);
  });

  test("queues the photos it replaces for deletion", async () => {
    const oldCover = await insertImage("old-cover.webp");
    const oldPlate = await insertImage("old-plate.webp");
    const recipeId = await insertRecipe({ coverImageId: oldCover, plateImageId: oldPlate });
    const coverImageId = await insertImage("cover.webp");
    const plateImageId = await insertImage("plate.webp");

    await t.run((ctx) => replaceRecipeImages(ctx, { recipeId, coverImageId, plateImageId }));

    expect(await scheduledDeletions()).toEqual([oldCover, oldPlate]);
  });

  test("keeps the existing plate when only a cover arrived", async () => {
    const oldPlate = await insertImage("old-plate.webp");
    const recipeId = await insertRecipe({ plateImageId: oldPlate });
    const coverImageId = await insertImage("cover.webp");

    await t.run((ctx) => replaceRecipeImages(ctx, { recipeId, coverImageId }));

    const recipe = await t.run((ctx) => ctx.db.get(recipeId));
    expect(recipe?.coverImageId).toBe(coverImageId);
    expect(recipe?.plateImageId).toBe(oldPlate);
    expect(await scheduledDeletions()).toEqual([]);
  });

  test("queues the new photos for deletion when the recipe is gone", async () => {
    const recipeId = await insertRecipe();
    await t.run((ctx) => ctx.db.delete(recipeId));
    const coverImageId = await insertImage("cover.webp");
    const plateImageId = await insertImage("plate.webp");

    await t.run((ctx) => replaceRecipeImages(ctx, { recipeId, coverImageId, plateImageId }));

    expect(await scheduledDeletions()).toEqual([coverImageId, plateImageId]);
  });

  test("detaches a recipe from a deleted cover without deleting the recipe", async () => {
    const coverImageId = await insertImage("cover.webp");
    const recipeId = await insertRecipe({ coverImageId });

    await t.run((ctx) => cascadeDelete(ctx, "images", coverImageId));

    const recipe = await t.run((ctx) => ctx.db.get(recipeId));
    expect(recipe).not.toBeNull();
    expect(recipe?.coverImageId).toBeUndefined();
  });
});
