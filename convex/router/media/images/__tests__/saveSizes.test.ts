import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../../../../_generated/api";
import schema from "../../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** Matches the placeholder in vitest.config.mts — the same value `serverMutation` compares against. */
const SERVER_KEY = "test-server-private-key-0123456789abcdef";

const seedImage = (t: ReturnType<typeof convexTest>) =>
  t.run((ctx) =>
    ctx.db.insert("images", {
      hasAlpha: false,
      key: "public/a.webp",
      url: "a.webp",
      width: 2048,
      height: 2048,
      size: 900_000,
      mimeType: "image/webp",
      tags: ["IMAGE"],
      updatedAt: Date.now(),
    }),
  );

const size = (px: number, bytes: number) => ({
  quality: 70,
  key: `public/${px}.webp`,
  url: `${px}.webp`,
  width: px,
  height: px,
  size: bytes,
});

describe("router/media/images/saveSizes", () => {
  describe("access", () => {
    test("`server` rejects a wrong server key", async () => {
      const t = convexTest(schema, modules);
      const imageId = await seedImage(t);

      await expect(
        t.mutation(api.router.media.images.saveSizes.server, {
          images: [{ imageId, sizes: [size(150, 5_000)] }],
          _serverKey: "not-the-key",
        }),
      ).rejects.toThrow();
    });

    test("`server` rejects an empty server key", async () => {
      const t = convexTest(schema, modules);
      const imageId = await seedImage(t);

      await expect(
        t.mutation(api.router.media.images.saveSizes.server, {
          images: [{ imageId, sizes: [size(150, 5_000)] }],
          _serverKey: "",
        }),
      ).rejects.toThrow();
    });

    test("a rejected call writes no renditions", async () => {
      const t = convexTest(schema, modules);
      const imageId = await seedImage(t);

      await expect(
        t.mutation(api.router.media.images.saveSizes.server, {
          images: [{ imageId, sizes: [size(150, 5_000)] }],
          _serverKey: "not-the-key",
        }),
      ).rejects.toThrow();

      await t.run(async (ctx) => {
        expect(await ctx.db.query("imageSizes").collect()).toEqual([]);
      });
    });

    test("`server` admits the right key", async () => {
      const t = convexTest(schema, modules);
      const imageId = await seedImage(t);

      const result = await t.mutation(api.router.media.images.saveSizes.server, {
        images: [{ imageId, sizes: [size(150, 5_000)] }],
        _serverKey: SERVER_KEY,
      });

      expect(result).toHaveLength(1);
    });
  });

  test("writes each rendition against its image", async () => {
    const t = convexTest(schema, modules);
    const imageId = await seedImage(t);

    await t.mutation(api.router.media.images.saveSizes.server, {
      images: [{ imageId, sizes: [size(150, 5_000), size(600, 60_000)] }],
      _serverKey: SERVER_KEY,
    });

    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("imageSizes")
        .withIndex("by_image_id", (q) => q.eq("imageId", imageId))
        .collect();

      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.width).sort((a, b) => a - b)).toEqual([150, 600]);
    });
  });

  /** The returned `size` is what a usage meter would bill, so it must be the sum, not the count. */
  test("reports the total bytes written per image", async () => {
    const t = convexTest(schema, modules);
    const imageId = await seedImage(t);

    const result = await t.mutation(api.router.media.images.saveSizes.server, {
      images: [{ imageId, sizes: [size(150, 5_000), size(600, 60_000)] }],
      _serverKey: SERVER_KEY,
    });

    expect(result[0]).toEqual({ _id: imageId, size: 65_000 });
  });

  test("an image with no renditions totals zero rather than failing", async () => {
    const t = convexTest(schema, modules);
    const imageId = await seedImage(t);

    const result = await t.mutation(api.router.media.images.saveSizes.server, {
      images: [{ imageId, sizes: [] }],
      _serverKey: SERVER_KEY,
    });

    expect(result[0]?.size).toBe(0);
  });

  test("handles several images in one call", async () => {
    const t = convexTest(schema, modules);
    const first = await seedImage(t);
    const second = await seedImage(t);

    const result = await t.mutation(api.router.media.images.saveSizes.server, {
      images: [
        { imageId: first, sizes: [size(150, 5_000)] },
        { imageId: second, sizes: [size(600, 60_000)] },
      ],
      _serverKey: SERVER_KEY,
    });

    expect(result.map((r) => r._id)).toEqual([first, second]);
    expect(result.map((r) => r.size)).toEqual([5_000, 60_000]);
  });
});
