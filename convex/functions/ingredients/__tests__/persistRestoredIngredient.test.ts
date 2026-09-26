import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import type { PortableIngredient } from "@convex/schema/ingredientPayloads";

import schema from "../../../schema";
import { persistRestoredIngredient } from "../persistRestoredIngredient";

const modules = import.meta.glob("/convex/**/*.*s");

const portable: PortableIngredient = {
  origin: { ingredientId: "other-deployment-id", creationTime: 1 },
  row: {
    slug: "carrot",
    name: {
      values: { fr: "Carotte", en: "Carrot" },
      meta: { fr: { status: "edited", sourceHash: "a" }, en: { status: "edited", sourceHash: "b" } },
    },
    emoji: "🥕",
    category: "VEGETABLE",
    diet: "vegan",
    allergens: [],
    source: "seed",
    defaultUnit: "pcs",
    defaultQuantity: 1,
    nutrition: { calories: 41, protein: 1, fat: 0.2, saturatedFat: 0, carbohydrates: 10, sugars: 5, fiber: 3, sodium: 60 },
  },
};

const imageRow = {
  hasAlpha: true,
  key: "public/kept.png",
  url: "kept.png",
  width: 512,
  height: 512,
  size: 10_000,
  mimeType: "image/png",
  tags: ["IMAGE" as const],
  updatedAt: 1,
};

describe("persistRestoredIngredient", () => {
  test("inserts a new ingredient, which then wants its image", async () => {
    const t = convexTest(schema, modules);

    const { ingredientId, created, needsImage } = await t.run((ctx) =>
      persistRestoredIngredient(ctx, { ingredient: portable }),
    );

    expect({ created, needsImage }).toEqual({ created: true, needsImage: true });
    const row = await t.run((ctx) => ctx.db.get(ingredientId));
    expect(row?.slug).toBe("carrot");
    expect(row?.imageId).toBeUndefined();
  });

  /** "Fill missing image": a matched row keeps its facts, and wants an image only if it has none. */
  test.each([
    { has: "no image", withImage: false, needsImage: true },
    { has: "an image", withImage: true, needsImage: false },
  ])("leaves a matching row with $has untouched, and says whether it wants one", async ({ withImage, needsImage }) => {
    const t = convexTest(schema, modules);
    const existingId = await t.run(async (ctx) =>
      ctx.db.insert("ingredients", {
        ...portable.row,
        name: { values: { fr: "Carotte maison", en: "Home carrot" }, meta: {} },
        defaultUnit: "kg",
        imageId: withImage ? await ctx.db.insert("images", imageRow) : undefined,
        search: { fr: "carotte maison", en: "home carrot" },
        updatedAt: 1,
      }),
    );

    const result = await t.run((ctx) => persistRestoredIngredient(ctx, { ingredient: portable }));

    expect(result).toEqual({ ingredientId: existingId, created: false, needsImage });
    expect(await t.run((ctx) => ctx.db.get(existingId))).toMatchObject({ defaultUnit: "kg", updatedAt: 1 });
  });
});
