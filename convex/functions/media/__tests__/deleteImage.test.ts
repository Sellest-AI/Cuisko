import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";
import { deleteImageRowsAfterFilesRemoved } from "../deleteImage";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

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

/**
 * These cover the helpers directly, where the router tests cover them through the registered
 * mutation. Both are worth having: the router test proves the wiring, this one proves the helper
 * is correct for a caller that is not that mutation — which is the point of it living in
 * `functions/` rather than in the router file.
 */
describe("functions/media/deleteImage", () => {
  describe("deleteImageRowsAfterFilesRemoved", () => {
    test("deletes the image and its renditions", async () => {
      const t = convexTest(schema, modules);

      const imageId = await t.run(async (ctx) => {
        const id = await ctx.db.insert("images", imageRow("a.webp"));
        await ctx.db.insert("imageSizes", {
          imageId: id, quality: 70, key: "public/150.webp", url: "150.webp",
          width: 150, height: 150, size: 5_000,
        });
        return id;
      });

      await t.run((ctx) => deleteImageRowsAfterFilesRemoved(ctx, imageId));

      await t.run(async (ctx) => {
        expect(await ctx.db.get(imageId)).toBeNull();
        expect(await ctx.db.query("imageSizes").collect()).toEqual([]);
      });
    });

    test("detaches an ingredient rather than deleting it", async () => {
      const t = convexTest(schema, modules);

      const { imageId, ingredientId } = await t.run(async (ctx) => {
        const imageId = await ctx.db.insert("images", imageRow("a.webp"));
        return { imageId, ingredientId: await ctx.db.insert("ingredients", ingredientRow(imageId)) };
      });

      await t.run((ctx) => deleteImageRowsAfterFilesRemoved(ctx, imageId));

      await t.run(async (ctx) => {
        const ingredient = await ctx.db.get(ingredientId);

        expect(ingredient).not.toBeNull();
        expect(ingredient?.imageId).toBeUndefined();
      });
    });

    test("takes the objects placed on the image with it", async () => {
      const t = convexTest(schema, modules);

      const { base, cutout } = await t.run(async (ctx) => {
        const base = await ctx.db.insert("images", imageRow("base.webp"));
        const cutout = await ctx.db.insert("images", imageRow("cutout.webp"));
        await ctx.db.insert("imageObjects", {
          imageId: cutout, baseImageId: base, x: 5, y: 7, updatedAt: Date.now(),
        });
        return { base, cutout };
      });

      await t.run((ctx) => deleteImageRowsAfterFilesRemoved(ctx, base));

      await t.run(async (ctx) => {
        expect(await ctx.db.get(base)).toBeNull();
        expect(await ctx.db.get(cutout)).toBeNull();
        expect(await ctx.db.query("imageObjects").collect()).toEqual([]);
      });
    });

    test("is a no-op for an image that is already gone", async () => {
      const t = convexTest(schema, modules);

      const imageId = await t.run(async (ctx) => {
        const id = await ctx.db.insert("images", imageRow("a.webp"));
        await ctx.db.delete(id);
        return id;
      });

      // `t.run` serialises the handler's return, so the helper's `undefined` arrives as `null`.
      await expect(
        t.run((ctx) => deleteImageRowsAfterFilesRemoved(ctx, imageId)),
      ).resolves.toBeNull();
    });
  });
});
