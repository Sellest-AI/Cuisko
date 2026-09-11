import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

const imageRow = (url: string) => ({
  hasAlpha: false,
  key: `public/${url}`,
  url,
  width: 512,
  height: 512,
  size: 100_000,
  mimeType: "image/webp",
  tags: ["IMAGE" as const],
  updatedAt: Date.now(),
});

const ingredientRow = (imageId?: Id<"images">) => ({
  name: { values: { en: "Potato", fr: "Pomme de terre" }, meta: {} },
  emoji: "🥔",
  category: "VEGETABLE" as const,
  defaultUnit: "g" as const,
  defaultQuantity: 500,
  nutrition: { calories: 77, protein: 2, fat: 0.1, carbohydrates: 17 },
  imageId,
  updatedAt: Date.now(),
});

/** What the generator scheduled, without running it — the action behind it talks to S3. */
const scheduled = (t: ReturnType<typeof convexTest>) =>
  t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());

describe("router/ingredients/generateImage", () => {
  test("points the ingredient at the new image", async () => {
    const t = convexTest(schema, modules);

    const { ingredientId, imageId } = await t.run(async (ctx) => ({
      ingredientId: await ctx.db.insert("ingredients", ingredientRow()),
      imageId: await ctx.db.insert("images", imageRow("new.webp")),
    }));

    await t.mutation(internal.router.ingredients.generateImage._internal_persist, {
      ingredientId,
      imageId,
    });

    await t.run(async (ctx) => {
      expect((await ctx.db.get(ingredientId))?.imageId).toBe(imageId);
    });
  });

  test("schedules nothing when the ingredient had no image", async () => {
    const t = convexTest(schema, modules);

    const { ingredientId, imageId } = await t.run(async (ctx) => ({
      ingredientId: await ctx.db.insert("ingredients", ingredientRow()),
      imageId: await ctx.db.insert("images", imageRow("new.webp")),
    }));

    await t.mutation(internal.router.ingredients.generateImage._internal_persist, {
      ingredientId,
      imageId,
    });

    expect(await scheduled(t)).toEqual([]);
  });

  /**
   * The replacement path. The ingredient points at the CUT-OUT; the render it was cut from is its
   * base. Cleanup is aimed at that base, because deleting it cascades to the cut-out — aiming at
   * the cut-out instead would leave the background render orphaned in the bucket forever.
   */
  test("schedules deletion of the outdated image's base, not the cut-out", async () => {
    const t = convexTest(schema, modules);

    const { ingredientId, newImageId, oldBaseId } = await t.run(async (ctx) => {
      const oldBaseId = await ctx.db.insert("images", imageRow("old-base.webp"));
      const oldCutoutId = await ctx.db.insert("images", imageRow("old-cutout.webp"));
      await ctx.db.insert("imageObjects", {
        imageId: oldCutoutId,
        baseImageId: oldBaseId,
        x: 0,
        y: 0,
        updatedAt: Date.now(),
      });

      return {
        ingredientId: await ctx.db.insert("ingredients", ingredientRow(oldCutoutId)),
        newImageId: await ctx.db.insert("images", imageRow("new.webp")),
        oldBaseId,
      };
    });

    await t.mutation(internal.router.ingredients.generateImage._internal_persist, {
      ingredientId,
      imageId: newImageId,
    });

    const jobs = await scheduled(t);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.name).toContain("deleteOne");
    expect(jobs[0]?.args[0]).toEqual({ imageId: oldBaseId });
  });

  /**
   * The ordering question this mutation turns on: the patch and the schedule commit in the same
   * transaction, and Convex runs a scheduled function only after it commits. So the cleanup can
   * never observe the ingredient still pointing at the image it is about to delete.
   */
  test("has already repointed the ingredient before the cleanup can run", async () => {
    const t = convexTest(schema, modules);

    const { ingredientId, newImageId, oldCutoutId } = await t.run(async (ctx) => {
      const oldBaseId = await ctx.db.insert("images", imageRow("old-base.webp"));
      const oldCutoutId = await ctx.db.insert("images", imageRow("old-cutout.webp"));
      await ctx.db.insert("imageObjects", {
        imageId: oldCutoutId, baseImageId: oldBaseId, x: 0, y: 0, updatedAt: Date.now(),
      });

      return {
        ingredientId: await ctx.db.insert("ingredients", ingredientRow(oldCutoutId)),
        newImageId: await ctx.db.insert("images", imageRow("new.webp")),
        oldCutoutId,
      };
    });

    await t.mutation(internal.router.ingredients.generateImage._internal_persist, {
      ingredientId,
      imageId: newImageId,
    });

    await t.run(async (ctx) => {
      const ingredient = await ctx.db.get(ingredientId);

      expect(ingredient?.imageId).toBe(newImageId);
      expect(ingredient?.imageId).not.toBe(oldCutoutId);
    });
  });

  /**
   * An outdated image with no `imageObjects` row — an upload that was never a generated pair.
   * It is its own root, so it is the one scheduled; aiming at nothing would leak it.
   */
  test("schedules the outdated image itself when it has no base", async () => {
    const t = convexTest(schema, modules);

    const { ingredientId, newImageId, orphan } = await t.run(async (ctx) => {
      const orphan = await ctx.db.insert("images", imageRow("orphan.webp"));

      return {
        orphan,
        ingredientId: await ctx.db.insert("ingredients", ingredientRow(orphan)),
        newImageId: await ctx.db.insert("images", imageRow("new.webp")),
      };
    });

    await t.mutation(internal.router.ingredients.generateImage._internal_persist, {
      ingredientId,
      imageId: newImageId,
    });

    const jobs = await scheduled(t);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.args[0]).toEqual({ imageId: orphan });
  });
});
