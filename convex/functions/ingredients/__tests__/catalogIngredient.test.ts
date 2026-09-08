import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import type { Doc, Id } from "../../../_generated/dataModel";
import schema from "../../../schema";
import {
  loadCatalogIngredient,
  loadCatalogIngredients,
  toCatalogIngredient,
} from "../catalogIngredient";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

const ingredientRow = (over: Partial<Doc<"ingredients">> = {}) => ({
  name: { values: { en: "Potato", fr: "Pomme de terre" }, meta: {} },
  emoji: "🥔",
  aliases: { fr: ["patates"] },
  category: "VEGETABLE" as const,
  defaultUnit: "g" as const,
  defaultQuantity: 500,
  nutrition: { calories: 77, protein: 2, fat: 0.1, carbohydrates: 17 },
  updatedAt: Date.now(),
  ...over,
});

const imageRow = (url: string) => ({
  hasAlpha: true,
  key: `public/${url}`,
  url,
  width: 512,
  height: 512,
  size: 100_000,
  mimeType: "image/webp",
  tags: ["IMAGE" as const, "OBJECT" as const],
  updatedAt: Date.now(),
});

describe("functions/ingredients/catalogIngredient", () => {
  describe("toCatalogIngredient", () => {
    test("resolves the name and aliases into the caller's locale", async () => {
      const t = convexTest(schema, modules);

      const row = await t.run(async (ctx) => {
        const id = await ctx.db.insert("ingredients", ingredientRow());
        return (await ctx.db.get(id))!;
      });

      expect(toCatalogIngredient(row, "fr").name).toBe("Pomme de terre");
      expect(toCatalogIngredient(row, "fr").aliases).toEqual(["patates"]);
    });

    test("drops the server-only search column", async () => {
      const t = convexTest(schema, modules);

      const row = await t.run(async (ctx) => {
        const id = await ctx.db.insert("ingredients", ingredientRow({ search: { en: "Potato" } }));
        return (await ctx.db.get(id))!;
      });

      expect(toCatalogIngredient(row, "en")).not.toHaveProperty("search");
    });

    /**
     * `getImage` answers `null` for an id that no longer resolves, and the field must come back
     * ABSENT rather than null — a deleted image and an ingredient that never had one have to read
     * the same to the client, or every tile needs two checks instead of one.
     */
    test("normalises a null image to an absent field", async () => {
      const t = convexTest(schema, modules);

      const row = await t.run(async (ctx) => {
        const id = await ctx.db.insert("ingredients", ingredientRow());
        return (await ctx.db.get(id))!;
      });

      const result = toCatalogIngredient(row, "en", null);

      expect(result.image).toBeUndefined();
      expect("image" in result && result.image === null).toBe(false);
    });
  });

  describe("loadCatalogIngredient", () => {
    test("attaches the image, sized", async () => {
      const t = convexTest(schema, modules);

      const result = await t.run(async (ctx) => {
        const imageId = await ctx.db.insert("images", imageRow("potato.webp"));
        await ctx.db.insert("imageSizes", {
          imageId, quality: 40, key: "public/150.webp", url: "150.webp",
          width: 150, height: 150, size: 5_000,
        });
        const id = await ctx.db.insert("ingredients", ingredientRow({ imageId }));

        return loadCatalogIngredient(ctx, (await ctx.db.get(id))!, "en");
      });

      expect(result.image?.url).toBe("potato.webp");
      expect(result.image?.sizes.thumbnail.url).toBe("150.webp");
    });

    test("leaves the field absent for a row with no image", async () => {
      const t = convexTest(schema, modules);

      const result = await t.run(async (ctx) => {
        const id = await ctx.db.insert("ingredients", ingredientRow());
        return loadCatalogIngredient(ctx, (await ctx.db.get(id))!, "en");
      });

      expect(result.image).toBeUndefined();
    });

    /** The dangling pointer the cascade now prevents — but this must degrade regardless. */
    test("leaves the field absent when the image row is gone", async () => {
      const t = convexTest(schema, modules);

      const result = await t.run(async (ctx) => {
        const imageId = await ctx.db.insert("images", imageRow("potato.webp"));
        const id = await ctx.db.insert("ingredients", ingredientRow({ imageId }));
        await ctx.db.delete(imageId);

        return loadCatalogIngredient(ctx, (await ctx.db.get(id))!, "en");
      });

      expect(result.image).toBeUndefined();
      expect(result.emoji).toBe("🥔"); // and the tile still has something to draw
    });
  });

  describe("loadCatalogIngredients", () => {
    test("keeps the order it was given", async () => {
      const t = convexTest(schema, modules);

      const result = await t.run(async (ctx) => {
        const rows: Doc<"ingredients">[] = [];
        for (const en of ["Potato", "Carrot", "Onion"]) {
          const id = await ctx.db.insert("ingredients", ingredientRow({
            name: { values: { en }, meta: {} },
          }));
          rows.push((await ctx.db.get(id))!);
        }

        return loadCatalogIngredients(ctx, rows, "en");
      });

      expect(result.map((r) => r.name)).toEqual(["Potato", "Carrot", "Onion"]);
    });

    test("resolves a mix of imaged and image-less rows", async () => {
      const t = convexTest(schema, modules);

      const result = await t.run(async (ctx) => {
        const imageId = await ctx.db.insert("images", imageRow("potato.webp"));
        const withImage = await ctx.db.insert("ingredients", ingredientRow({ imageId }));
        const without = await ctx.db.insert("ingredients", ingredientRow({
          name: { values: { en: "Carrot" }, meta: {} },
        }));

        return loadCatalogIngredients(
          ctx,
          [(await ctx.db.get(withImage))!, (await ctx.db.get(without))!],
          "en",
        );
      });

      expect(result[0]?.image?.url).toBe("potato.webp");
      expect(result[1]?.image).toBeUndefined();
    });

    test("returns an empty list unchanged", async () => {
      const t = convexTest(schema, modules);

      expect(await t.run((ctx) => loadCatalogIngredients(ctx, [], "en"))).toEqual([]);
    });

    /** Two ingredients may share one generated image; neither read may interfere with the other. */
    test("resolves a shared image for both rows", async () => {
      const t = convexTest(schema, modules);

      const result = await t.run(async (ctx) => {
        const imageId: Id<"images"> = await ctx.db.insert("images", imageRow("shared.webp"));
        const a = await ctx.db.insert("ingredients", ingredientRow({ imageId }));
        const b = await ctx.db.insert("ingredients", ingredientRow({ imageId }));

        return loadCatalogIngredients(ctx, [(await ctx.db.get(a))!, (await ctx.db.get(b))!], "en");
      });

      expect(result[0]?.image?.url).toBe("shared.webp");
      expect(result[1]?.image?.url).toBe("shared.webp");
    });
  });
});
