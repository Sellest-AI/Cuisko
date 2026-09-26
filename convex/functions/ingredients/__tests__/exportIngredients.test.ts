import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Id } from "@convex/_generated/dataModel";

import schema from "../../../schema";
import { exportIngredients } from "../exportIngredients";

const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

const insertImage = (url: string) =>
  t.run((ctx) =>
    ctx.db.insert("images", {
      hasAlpha: false,
      key: `public/${url}`,
      url,
      width: 512,
      height: 512,
      size: 10_000,
      mimeType: "image/webp",
      tags: ["IMAGE"],
      updatedAt: 1,
    }),
  );

/** A cut-out on its base render, as `generateImageNode` leaves one. */
const insertImagePair = async (url: string, baseUrl: string) => {
  const base = await insertImage(baseUrl);
  const image = await insertImage(url);
  await t.run((ctx) => ctx.db.insert("imageObjects", { imageId: image, baseImageId: base, x: 12, y: 34, updatedAt: 1 }));

  return image;
};

const insertIngredient = (fr: string, imageId?: Id<"images">) =>
  t.run((ctx) =>
    ctx.db.insert("ingredients", {
      slug: fr.toLowerCase(),
      name: { values: { fr, en: `${fr} (en)` }, meta: { en: { status: "machine", sourceHash: "h" } } },
      aliases: { fr: [`${fr}s`] },
      search: { fr: fr.toLowerCase(), en: "" },
      emoji: "🥕",
      imageId,
      category: "VEGETABLE",
      diet: "vegan",
      allergens: [],
      source: "seed",
      defaultUnit: "pcs",
      defaultQuantity: 1,
      gramsPerPiece: 80,
      nutrition: { calories: 41, protein: 1, fat: 0, carbohydrates: 10 },
      nutriScore: { grade: "A", points: -5 },
      updatedAt: 1,
    }),
  );

const page = (numItems = 10, cursor: string | null = null) =>
  t.run((ctx) => exportIngredients(ctx, { paginationOpts: { cursor, numItems } }));

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("exportIngredients", () => {
  /** The row travels whole but for its id and the three columns the restore derives or stamps. */
  test("spells the row without its id, its image id or its derived columns", async () => {
    const id = await insertIngredient("Carotte");

    const [exported] = (await page()).page;

    expect(exported?.origin.ingredientId).toBe(id);
    expect(exported?.row).toMatchObject({
      slug: "carotte",
      name: { values: { fr: "Carotte", en: "Carotte (en)" } },
      aliases: { fr: ["Carottes"] },
      diet: "vegan",
      gramsPerPiece: 80,
    });
    expect(exported?.row).not.toHaveProperty("search");
    expect(exported?.row).not.toHaveProperty("nutriScore");
    expect(exported?.row).not.toHaveProperty("updatedAt");
    expect(exported?.row).not.toHaveProperty("imageId");
  });

  test("exports the image as the cut-out, its base render and its offset", async () => {
    await insertIngredient("Carotte", await insertImagePair("cutout.png", "base.webp"));

    const [exported] = (await page()).page;

    expect(exported?.image).toEqual({ url: "cutout.png", base: { url: "base.webp" }, x: 12, y: 34 });
  });

  /** Half a pair cannot be rebuilt by the restore, which uploads the base first. */
  test("exports an image with no base render as no image", async () => {
    await insertIngredient("Carotte", await insertImage("orphan.png"));

    const [exported] = (await page()).page;

    expect(exported?.image).toBeUndefined();
  });

  test("pages through every row, oldest first", async () => {
    await insertIngredient("Carotte");
    await insertIngredient("Poireau");
    await insertIngredient("Navet");

    const first = await page(2);
    const second = await page(2, first.continueCursor);

    expect([...first.page, ...second.page].map(({ row }) => row.slug)).toEqual(["carotte", "poireau", "navet"]);
    expect(second.isDone).toBe(true);
  });
});
