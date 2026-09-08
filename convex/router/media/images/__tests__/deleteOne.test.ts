import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "../../../../_generated/api";
import type { Id } from "../../../../_generated/dataModel";
import schema from "../../../../schema";

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
 * Deleting an image is the one place the media tables are all touched at once, and every row it
 * forgets is invisible afterwards — an orphan reads exactly like a row nobody has queried yet.
 * These assert the fan-out rather than the happy path.
 */
describe("router/media/images/deleteOne", () => {
  test("removes the image and its renditions", async () => {
    const t = convexTest(schema, modules);

    const imageId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("images", imageRow("a.webp"));
      await ctx.db.insert("imageSizes", {
        imageId: id, quality: 70, key: "public/150.webp", url: "150.webp",
        width: 150, height: 150, size: 5_000,
      });
      return id;
    });

    await t.mutation(internal.router.media.images.deleteOne._internal_persist, {
      imageId, deletedKeys: ["public/a.webp", "public/150.webp"],
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(imageId)).toBeNull();
      expect(await ctx.db.query("imageSizes").collect()).toEqual([]);
    });
  });

  /**
   * The back-reference that used to be left dangling. An ingredient outlives its photo, so the
   * pointer is cleared rather than the row deleted — losing an image must not lose the ingredient.
   */
  test("detaches the ingredient instead of deleting it", async () => {
    const t = convexTest(schema, modules);

    const { imageId, ingredientId } = await t.run(async (ctx) => {
      const imageId = await ctx.db.insert("images", imageRow("a.webp"));
      const ingredientId = await ctx.db.insert("ingredients", ingredientRow(imageId));
      return { imageId, ingredientId };
    });

    await t.mutation(internal.router.media.images.deleteOne._internal_persist, {
      imageId, deletedKeys: ["public/a.webp"],
    });

    await t.run(async (ctx) => {
      const ingredient = await ctx.db.get(ingredientId);

      expect(ingredient).not.toBeNull();
      expect(ingredient?.imageId).toBeUndefined();
      expect(ingredient?.emoji).toBe("🥔"); // the fallback the tile now draws
    });
  });

  test("leaves ingredients pointing at other images alone", async () => {
    const t = convexTest(schema, modules);

    const { doomed, survivorId } = await t.run(async (ctx) => {
      const doomed = await ctx.db.insert("images", imageRow("a.webp"));
      const other = await ctx.db.insert("images", imageRow("b.webp"));
      await ctx.db.insert("ingredients", ingredientRow(doomed));
      const survivorId = await ctx.db.insert("ingredients", ingredientRow(other));
      return { doomed, survivorId };
    });

    await t.mutation(internal.router.media.images.deleteOne._internal_persist, {
      imageId: doomed, deletedKeys: ["public/a.webp"],
    });

    await t.run(async (ctx) => {
      expect((await ctx.db.get(survivorId))?.imageId).toBeDefined();
    });
  });

  /**
   * The generated-image shape: a white-background render with a transparent cut-out placed on it.
   * Deleting the background must take the cut-out's row with it — the action has already deleted
   * its file, so a surviving row would point at a URL that 404s.
   */
  test("deletes the objects placed on the image, and their link rows", async () => {
    const t = convexTest(schema, modules);

    const { base, cutout } = await t.run(async (ctx) => {
      const base = await ctx.db.insert("images", imageRow("base.webp"));
      const cutout = await ctx.db.insert("images", imageRow("cutout.webp"));
      await ctx.db.insert("imageObjects", {
        imageId: cutout, baseImageId: base, x: 5, y: 7, updatedAt: Date.now(),
      });
      return { base, cutout };
    });

    await t.mutation(internal.router.media.images.deleteOne._internal_persist, {
      imageId: base, deletedKeys: ["public/base.webp", "public/cutout.webp"],
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(base)).toBeNull();
      expect(await ctx.db.get(cutout)).toBeNull();
      expect(await ctx.db.query("imageObjects").collect()).toEqual([]);
    });
  });

  test("removes the user's claim on the image", async () => {
    const t = convexTest(schema, modules);

    const imageId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {});
      const imageId = await ctx.db.insert("images", imageRow("a.webp"));
      await ctx.db.insert("userImages", { userId, imageId });
      return imageId;
    });

    await t.mutation(internal.router.media.images.deleteOne._internal_persist, {
      imageId, deletedKeys: ["public/a.webp"],
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.query("userImages").collect()).toEqual([]);
    });
  });

  test("is a no-op for an image that is already gone", async () => {
    const t = convexTest(schema, modules);

    const imageId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("images", imageRow("a.webp"));
      await ctx.db.delete(id);
      return id;
    });

    await expect(
      t.mutation(internal.router.media.images.deleteOne._internal_persist, { imageId, deletedKeys: [] }),
    ).resolves.toBeNull();
  });

  /**
   * The guard that replaced a "do not call directly" comment. A caller who has not deleted the
   * files has no key list to pass, so the ordering is enforced by the validator rather than by
   * whoever remembered to read the doc block. `@ts-expect-error` pins the compile-time half: if
   * `deletedKeys` ever became optional the directive would stop erroring and fail this file.
   */
  test("refuses a caller that cannot prove the files are gone", async () => {
    const t = convexTest(schema, modules);

    const imageId = await t.run(async (ctx) => ctx.db.insert("images", imageRow("a.webp")));

    await expect(
      // @ts-expect-error deletedKeys is required — omitting it is the mistake under test
      t.mutation(internal.router.media.images.deleteOne._internal_persist, { imageId }),
    ).rejects.toThrow();

    await t.run(async (ctx) => {
      expect(await ctx.db.get(imageId)).not.toBeNull();
    });
  });
});
