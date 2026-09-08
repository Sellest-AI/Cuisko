import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";
import { saveImage, saveImageSize } from "../saveImage";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

const args = (over: Record<string, unknown> = {}) => ({
  url: "https://cdn.test/a.webp",
  hashBase64: "abc123",
  key: "public/a.webp",
  width: 1024,
  height: 1024,
  size: 500_000,
  mimeType: "image/webp",
  userId: null as Id<"users"> | null,
  ...over,
});

describe("functions/media/saveImage", () => {
  test("writes the image and hands back its id", async () => {
    const t = convexTest(schema, modules);

    const saved = await t.run((ctx) => saveImage(ctx, args()));

    expect(saved.imageId).toBe(saved._id);
    expect(saved.url).toBe("https://cdn.test/a.webp");
    expect(saved.hasAlpha).toBe(false); // defaulted, not left undefined
  });

  /**
   * Tags are derived, not passed through: `IMAGE` is always present, and `OBJECT` is added exactly
   * when the image has transparency. They are what a later query filters on, so a wrong tag is a
   * cut-out that never shows up as one.
   */
  describe("tags", () => {
    test("an opaque image is tagged IMAGE only", async () => {
      const t = convexTest(schema, modules);

      const saved = await t.run((ctx) => saveImage(ctx, args()));

      expect(saved.tags).toEqual(["IMAGE"]);
    });

    test("a transparent image is also tagged OBJECT", async () => {
      const t = convexTest(schema, modules);

      const saved = await t.run((ctx) => saveImage(ctx, args({ hasAlpha: true })));

      expect(saved.tags).toContain("IMAGE");
      expect(saved.tags).toContain("OBJECT");
    });

    test("does not duplicate a tag the caller already supplied", async () => {
      const t = convexTest(schema, modules);

      const saved = await t.run((ctx) =>
        saveImage(ctx, args({ tags: ["IMAGE", "OBJECT"], hasAlpha: true })),
      );

      expect(saved.tags).toHaveLength(2);
      expect(new Set(saved.tags).size).toBe(2);
    });

    test("keeps a caller's OBJECT tag on an opaque image", async () => {
      const t = convexTest(schema, modules);

      const saved = await t.run((ctx) => saveImage(ctx, args({ tags: ["OBJECT"] })));

      expect(new Set(saved.tags)).toEqual(new Set(["OBJECT", "IMAGE"]));
    });
  });

  describe("ownership", () => {
    test("a null userId leaves the image unclaimed", async () => {
      const t = convexTest(schema, modules);

      const saved = await t.run((ctx) => saveImage(ctx, args()));

      // Generated ingredient photos are catalog-wide, so nobody owns them.
      expect(saved.userImageId).toBeNull();
      await t.run(async (ctx) => {
        expect(await ctx.db.query("userImages").collect()).toEqual([]);
      });
    });

    test("a userId creates the claim row", async () => {
      const t = convexTest(schema, modules);

      const { saved, userId } = await t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", {});
        return { saved: await saveImage(ctx, args({ userId })), userId };
      });

      expect(saved.userImageId).not.toBeNull();
      await t.run(async (ctx) => {
        const claims = await ctx.db.query("userImages").collect();

        expect(claims).toHaveLength(1);
        expect(claims[0]?.userId).toBe(userId);
        expect(claims[0]?.imageId).toBe(saved._id);
      });
    });
  });

  describe("placement on a base image", () => {
    test("records where the cut-out sits on its background", async () => {
      const t = convexTest(schema, modules);

      const { saved, baseImageId } = await t.run(async (ctx) => {
        const baseImageId = await ctx.db.insert("images", {
          hasAlpha: false, key: "public/base.webp", url: "base.webp",
          width: 512, height: 512, size: 100, mimeType: "image/webp",
          tags: ["IMAGE"], updatedAt: Date.now(),
        });

        return {
          saved: await saveImage(ctx, args({ object: { x: 12, y: 34, baseImageId } })),
          baseImageId,
        };
      });

      await t.run(async (ctx) => {
        const objects = await ctx.db.query("imageObjects").collect();

        expect(objects).toHaveLength(1);
        // The link points FROM the new cut-out TO the background it was cut from.
        expect(objects[0]?.imageId).toBe(saved._id);
        expect(objects[0]?.baseImageId).toBe(baseImageId);
        expect(objects[0]?.x).toBe(12);
        expect(objects[0]?.y).toBe(34);
      });
    });

    test("writes no link when there is no placement", async () => {
      const t = convexTest(schema, modules);

      await t.run((ctx) => saveImage(ctx, args()));

      await t.run(async (ctx) => {
        expect(await ctx.db.query("imageObjects").collect()).toEqual([]);
      });
    });
  });

  /**
   * Both callers reach this through `retryPromise`, which retries every failure ten times by
   * default. A commit whose reply is lost is therefore replayed with identical arguments, and the
   * unconditional insert this replaced turned that into a second `images` row for one bucket
   * object — invisible, because nothing queries images by key and the orphan reads exactly like a
   * row nobody has asked for yet.
   */
  describe("arriving twice", () => {
    test("returns the existing row rather than writing a second one", async () => {
      const t = convexTest(schema, modules);

      const first = await t.run((ctx) => saveImage(ctx, args()));
      const second = await t.run((ctx) => saveImage(ctx, args()));

      expect(second.imageId).toBe(first.imageId);

      await t.run(async (ctx) => {
        expect(await ctx.db.query("images").collect()).toHaveLength(1);
      });
    });

    test("does not claim the image twice for the same user", async () => {
      const t = convexTest(schema, modules);
      const userId = await t.run((ctx) => ctx.db.insert("users", {}));

      const first = await t.run((ctx) => saveImage(ctx, args({ userId })));
      const second = await t.run((ctx) => saveImage(ctx, args({ userId })));

      expect(second.userImageId).toBe(first.userImageId);

      await t.run(async (ctx) => {
        expect(await ctx.db.query("userImages").collect()).toHaveLength(1);
      });
    });

    test("does not place the cut-out on its background twice", async () => {
      const t = convexTest(schema, modules);
      const baseImageId = await t.run((ctx) =>
        saveImage(ctx, args({ key: "public/base.webp" })).then((image) => image.imageId));

      const object = { x: 5, y: 7, baseImageId };
      await t.run((ctx) => saveImage(ctx, args({ object })));
      await t.run((ctx) => saveImage(ctx, args({ object })));

      await t.run(async (ctx) => {
        expect(await ctx.db.query("imageObjects").collect()).toHaveLength(1);
      });
    });

    /**
     * A retry that died partway leaves some of the three inserts done. Converging on what is
     * missing is the reason each is guarded on its own rather than on whether the image existed.
     */
    test("adds the claim a half-finished first attempt never wrote", async () => {
      const t = convexTest(schema, modules);
      const userId = await t.run((ctx) => ctx.db.insert("users", {}));

      await t.run((ctx) => saveImage(ctx, args()));
      const retried = await t.run((ctx) => saveImage(ctx, args({ userId })));

      expect(retried.userImageId).not.toBeNull();

      await t.run(async (ctx) => {
        expect(await ctx.db.query("images").collect()).toHaveLength(1);
        expect(await ctx.db.query("userImages").collect()).toHaveLength(1);
      });
    });

    /**
     * `key` is a per-upload nanoid on the internal path, but the `server` mutation takes it from
     * the caller — so the same key CAN arrive describing different bytes, and the row has to
     * follow them. Returning the old row would leave `plannedImageSizes` sizing the ladder from
     * dimensions the bucket object no longer has.
     */
    test("refreshes a row re-registered at the same key with new bytes", async () => {
      const t = convexTest(schema, modules);

      const first = await t.run((ctx) => saveImage(ctx, args()));
      const second = await t.run((ctx) =>
        saveImage(ctx, args({ width: 2048, height: 1536, size: 900_000 })));

      expect(second.imageId).toBe(first.imageId);
      expect(second.width).toBe(2048);
      expect(second.height).toBe(1536);
    });

    /**
     * The placement guard matches the placement, not the image. A cut-out sitting on two
     * backgrounds is the shape a generated pair takes when the render is reused, and dropping the
     * second would leave `scheduleImageTreeDeletion` aiming at the wrong base.
     */
    test("places the same cut-out on a second background", async () => {
      const t = convexTest(schema, modules);

      const bases = await t.run(async (ctx) => ({
        one: (await saveImage(ctx, args({ key: "public/base-1.webp" }))).imageId,
        two: (await saveImage(ctx, args({ key: "public/base-2.webp" }))).imageId,
      }));

      await t.run((ctx) => saveImage(ctx, args({ object: { x: 5, y: 7, baseImageId: bases.one } })));
      await t.run((ctx) => saveImage(ctx, args({ object: { x: 5, y: 7, baseImageId: bases.two } })));

      await t.run(async (ctx) => {
        expect(await ctx.db.query("imageObjects").collect()).toHaveLength(2);
      });
    });

    test("a different key is a different image", async () => {
      const t = convexTest(schema, modules);

      const first = await t.run((ctx) => saveImage(ctx, args()));
      const other = await t.run((ctx) => saveImage(ctx, args({ key: "public/b.webp" })));

      expect(other.imageId).not.toBe(first.imageId);
    });
  });

  /**
   * The rendition half. A duplicate here is worse than a wasted row: `plannedImageSizes` reads
   * these back to decide which steps are already rendered.
   */
  describe("saveImageSize", () => {
    const size = (imageId: Id<"images">, over: Record<string, unknown> = {}) => ({
      imageId,
      quality: 70,
      key: "public/150.webp",
      width: 150,
      height: 150,
      url: "https://cdn.test/150.webp",
      size: 5_000,
      ...over,
    });

    test("writes the rendition once, however often it arrives", async () => {
      const t = convexTest(schema, modules);
      const { imageId } = await t.run((ctx) => saveImage(ctx, args()));

      const first = await t.run((ctx) => saveImageSize(ctx, size(imageId)));
      const second = await t.run((ctx) => saveImageSize(ctx, size(imageId)));

      expect(second).toBe(first);

      await t.run(async (ctx) => {
        expect(await ctx.db.query("imageSizes").collect()).toHaveLength(1);
      });
    });

    /**
     * Matched on the parent as well as the key: a key held by another image is not this image's
     * rendition, and suppressing the insert would leave the step missing from the `by_image_id`
     * read that `plannedImageSizes` makes, re-rendering it on every run.
     */
    test("does not let another image's key suppress the write", async () => {
      const t = convexTest(schema, modules);

      const mine = await t.run((ctx) => saveImage(ctx, args()));
      const other = await t.run((ctx) => saveImage(ctx, args({ key: "public/b.webp" })));

      await t.run((ctx) => saveImageSize(ctx, size(other.imageId)));
      await t.run((ctx) => saveImageSize(ctx, size(mine.imageId)));

      await t.run(async (ctx) => {
        const rows = await ctx.db
          .query("imageSizes")
          .withIndex("by_image_id", (q) => q.eq("imageId", mine.imageId))
          .collect();

        expect(rows).toHaveLength(1);
      });
    });

    test("a different key is a different rendition", async () => {
      const t = convexTest(schema, modules);
      const { imageId } = await t.run((ctx) => saveImage(ctx, args()));

      await t.run((ctx) => saveImageSize(ctx, size(imageId)));
      await t.run((ctx) => saveImageSize(ctx, size(imageId, { key: "public/336.webp", width: 336 })));

      await t.run(async (ctx) => {
        expect(await ctx.db.query("imageSizes").collect()).toHaveLength(2);
      });
    });
  });
});
