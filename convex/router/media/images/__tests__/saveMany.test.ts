import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../../../../_generated/api";
import schema from "../../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** Matches the placeholder in vitest.config.mts — the same value `serverMutation` compares against. */
const SERVER_KEY = "test-server-private-key-0123456789abcdef";

const image = (url: string) => ({
  url,
  key: `public/${url}`,
  hashBase64: `hash-${url}`,
  width: 1024,
  height: 1024,
  size: 500_000,
  mimeType: "image/webp",
});

describe("router/media/images/saveMany", () => {
  describe("access", () => {
    test("`server` rejects a wrong server key", async () => {
      const t = convexTest(schema, modules);

      await expect(
        t.mutation(api.router.media.images.saveMany.server, {
          userId: null,
          images: [image("a.webp")],
          _serverKey: "not-the-key",
        }),
      ).rejects.toThrow();
    });

    test("`server` rejects an empty server key", async () => {
      const t = convexTest(schema, modules);

      await expect(
        t.mutation(api.router.media.images.saveMany.server, {
          userId: null,
          images: [image("a.webp")],
          _serverKey: "",
        }),
      ).rejects.toThrow();
    });

    /** The rejection must happen before any write, or a bad key still costs rows. */
    test("a rejected call writes nothing", async () => {
      const t = convexTest(schema, modules);

      await expect(
        t.mutation(api.router.media.images.saveMany.server, {
          userId: null,
          images: [image("a.webp")],
          _serverKey: "not-the-key",
        }),
      ).rejects.toThrow();

      await t.run(async (ctx) => {
        expect(await ctx.db.query("images").collect()).toEqual([]);
      });
    });

    test("`server` admits the right key", async () => {
      const t = convexTest(schema, modules);

      const saved = await t.mutation(api.router.media.images.saveMany.server, {
        userId: null,
        images: [image("a.webp")],
        _serverKey: SERVER_KEY,
      });

      expect(saved).toHaveLength(1);
    });
  });

  test("saves every image in the batch", async () => {
    const t = convexTest(schema, modules);

    const saved = await t.mutation(api.router.media.images.saveMany.server, {
      userId: null,
      images: [image("a.webp"), image("b.webp"), image("c.webp")],
      _serverKey: SERVER_KEY,
    });

    expect(saved.map((s) => s.url)).toEqual(["a.webp", "b.webp", "c.webp"]);
  });

  test("accepts an empty batch without writing anything", async () => {
    const t = convexTest(schema, modules);

    const saved = await t.mutation(api.router.media.images.saveMany.server, {
      userId: null,
      images: [],
      _serverKey: SERVER_KEY,
    });

    expect(saved).toEqual([]);
  });

  test("attributes the whole batch to one user", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Franck" }));

    await t.mutation(api.router.media.images.saveMany.server, {
      userId,
      images: [image("a.webp"), image("b.webp")],
      _serverKey: SERVER_KEY,
    });

    await t.run(async (ctx) => {
      const claims = await ctx.db.query("userImages").collect();

      expect(claims).toHaveLength(2);
      expect(claims.every((c) => c.userId === userId)).toBe(true);
    });
  });
});
