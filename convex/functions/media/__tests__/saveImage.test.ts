import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";
import { saveImage } from "../saveImage";

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
});
