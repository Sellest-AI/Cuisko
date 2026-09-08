import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";
import { getImage, getImageWithObjects } from "../getImage";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

const image = (over: Partial<{ url: string; width: number; height: number; size: number }> = {}) => ({
  hasAlpha: false,
  key: "public/original.webp",
  url: "original.webp",
  width: 1024,
  height: 1024,
  size: 500_000,
  mimeType: "image/webp",
  tags: ["IMAGE" as const],
  updatedAt: Date.now(),
  ...over,
});

const rendition = (imageId: Id<"images">, px: number, bytes: number) => ({
  imageId,
  quality: 70,
  key: `public/${px}.webp`,
  url: `${px}.webp`,
  width: px,
  height: px,
  size: bytes,
});

describe("functions/media/getImage", () => {
  test("returns null for an id whose row is gone", async () => {
    const t = convexTest(schema, modules);

    const result = await t.run(async (ctx) => {
      const id = await ctx.db.insert("images", image());
      await ctx.db.delete(id);

      return getImage(ctx, id);
    });

    // Not a throw: a deleted photo must degrade to "this ingredient has no image", because the
    // ingredient row can still point at it until the cascade detaches it.
    expect(result).toBeNull();
  });

  test("joins the renditions onto the image", async () => {
    const t = convexTest(schema, modules);

    const result = await t.run(async (ctx) => {
      const id = await ctx.db.insert("images", image());
      await ctx.db.insert("imageSizes", rendition(id, 150, 5_000));
      await ctx.db.insert("imageSizes", rendition(id, 600, 60_000));

      return getImage(ctx, id);
    });

    expect(result?.sizes.thumbnail.url).toBe("150.webp");
    expect(result?.sizes.medium.url).toBe("600.webp");
    expect(result?._sizes).toHaveLength(2);
  });

  test("reads only the renditions of the image asked for", async () => {
    const t = convexTest(schema, modules);

    const result = await t.run(async (ctx) => {
      const wanted = await ctx.db.insert("images", image());
      const other = await ctx.db.insert("images", image({ url: "other.webp" }));
      await ctx.db.insert("imageSizes", rendition(wanted, 150, 5_000));
      await ctx.db.insert("imageSizes", rendition(other, 336, 20_000));

      return getImage(ctx, wanted);
    });

    expect(result?._sizes).toHaveLength(1);
    expect(result?.sizes.thumbnail.url).toBe("150.webp");
  });

  test("an image with no renditions still fills every slot", async () => {
    const t = convexTest(schema, modules);

    const result = await t.run(async (ctx) => getImage(ctx, await ctx.db.insert("images", image())));

    expect(result?.sizes.thumbnail.url).toBe("original.webp");
    expect(result?._sizes).toEqual([]);
  });

  describe("getImageWithObjects", () => {
    /**
     * The generated-ingredient pipeline stores two rows: the render on its white background, and
     * the cut-out placed on it. `imageObjects` links them, and this is the read that lets a delete
     * find the whole family — `baseImageId` points at the background, so the query is anchored
     * there rather than on the cut-out.
     */
    test("finds the objects placed on a base image", async () => {
      const t = convexTest(schema, modules);

      const result = await t.run(async (ctx) => {
        const base = await ctx.db.insert("images", image({ url: "base.webp" }));
        const cutout = await ctx.db.insert("images", image({ url: "cutout.webp" }));
        await ctx.db.insert("imageObjects", {
          imageId: cutout,
          baseImageId: base,
          x: 12,
          y: 34,
          updatedAt: Date.now(),
        });

        return getImageWithObjects(ctx, base);
      });

      expect(result?.objects).toHaveLength(1);
      expect(result?.objects[0]?.x).toBe(12);
    });

    test("reports no objects for a plain image", async () => {
      const t = convexTest(schema, modules);

      const result = await t.run(async (ctx) =>
        getImageWithObjects(ctx, await ctx.db.insert("images", image())),
      );

      expect(result?.objects).toEqual([]);
    });

    /** Anchored on `baseImageId`, so asking from the cut-out's side finds nothing. */
    test("does not find the link from the placed image's side", async () => {
      const t = convexTest(schema, modules);

      const result = await t.run(async (ctx) => {
        const base = await ctx.db.insert("images", image({ url: "base.webp" }));
        const cutout = await ctx.db.insert("images", image({ url: "cutout.webp" }));
        await ctx.db.insert("imageObjects", {
          imageId: cutout,
          baseImageId: base,
          x: 0,
          y: 0,
          updatedAt: Date.now(),
        });

        return getImageWithObjects(ctx, cutout);
      });

      expect(result?.objects).toEqual([]);
    });

    test("returns null for a missing image", async () => {
      const t = convexTest(schema, modules);

      const result = await t.run(async (ctx) => {
        const id = await ctx.db.insert("images", image());
        await ctx.db.delete(id);

        return getImageWithObjects(ctx, id);
      });

      expect(result).toBeNull();
    });
  });
});
