import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import { insertTestRecipe } from "@convex/functions/recipes/__tests__/recipes.fixtures";
import type { Id } from "@convex/_generated/dataModel";
import type { FatUse } from "@shared/ingredients";
import { facetsOf } from "@shared/tags";

import schema from "../../../schema";
import { exportCatalog } from "../exportCatalog";

const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

const insertImage = (url: string) =>
  t.run((ctx) =>
    ctx.db.insert("images", {
      hasAlpha: false,
      key: `public/${url}`,
      url,
      width: 768,
      height: 512,
      size: 100_000,
      mimeType: "image/webp",
      tags: ["IMAGE"],
      updatedAt: 1,
    }),
  );

const insertIngredient = (slug: string, fr: string, en: string) =>
  t.run((ctx) =>
    ctx.db.insert("ingredients", {
      slug,
      name: { values: { fr, en }, meta: {} },
      aliases: { fr: [`${fr}s`] },
      emoji: "x",
      category: "VEGETABLE",
      defaultUnit: "pcs",
      defaultQuantity: 1,
      nutrition: { calories: 1, protein: 0, fat: 0, carbohydrates: 0 },
      updatedAt: 1,
    }),
  );

type RecipeExtras = {
  userId?: Id<"users">;
  coverImageId?: Id<"images">;
  plateImageId?: Id<"images">;
  isArchived?: boolean;
};

const insertRecipe = (title: string, extras: RecipeExtras = {}) =>
  t.run((ctx) =>
    insertTestRecipe(ctx.db, {
      ...extras,
      title: { values: { fr: title, en: `${title} (en)` }, meta: { en: { status: "machine", sourceHash: "h" } } },
      description: { values: { fr: "" }, meta: {} },
      instructions: { values: { fr: "- Cuire." }, meta: {} },
      servings: 4,
      equipments: [],
      difficulty: 1,
      tags: ["vegan"],
      cuisine: "french",
      timings: { cooking: 10 },
      search: { fr: "carotte", en: "carrot" },
      ...facetsOf(["vegan"]),
      shuffleKey: 0.5,
      sourceUrl: `https://example.com/${title}`,
      updatedAt: 1,
    }),
  );

const link = (
  recipeId: Id<"recipes">,
  ingredientId: Id<"ingredients">,
  position: number,
  fatUse?: FatUse,
) =>
  t.run((ctx) =>
    ctx.db.insert("recipeIngredients", {
      recipeId,
      ingredientId,
      position,
      quantity: 2,
      unit: "pcs",
      ...(fatUse && { fatUse }),
      updatedAt: 1,
    }),
  );

const page = (numItems = 10, cursor: string | null = null) =>
  t.run((ctx) => exportCatalog(ctx, { paginationOpts: { cursor, numItems } }));

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("exportCatalog", () => {
  test("exports the whole row with every locale, without its ids", async () => {
    const recipeId = await insertRecipe("Tarte");

    const [exported] = (await page()).page;

    expect(exported?.origin.recipeId).toBe(recipeId);
    expect(exported?.row.title.values).toEqual({ fr: "Tarte", en: "Tarte (en)" });
    expect(exported?.row.title.meta.en?.status).toBe("machine");
    expect(exported?.row).toMatchObject({ tags: ["vegan"], isVegan: true, sourceUrl: "https://example.com/Tarte" });
    expect(exported?.row).not.toHaveProperty("_id");
    expect(exported?.row).not.toHaveProperty("userId");
    expect(exported?.row).not.toHaveProperty("coverImageId");
  });

  /** A cook's recipes are theirs: only the rows nobody owns move between deployments. */
  test("leaves out the recipes a cook owns", async () => {
    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Cook" }));
    await insertRecipe("Mine", { userId });
    await insertRecipe("Catalog");

    const { page: exported } = await page();

    expect(exported.map((recipe) => recipe.row.title.values.fr)).toEqual(["Catalog"]);
  });

  /**
   * An archived recipe was deleted (ADR 0017), and a recipe with no owner is not always one Cuisko
   * wrote: an account erased with `force` leaves its recipes archived and authorless. Copying either
   * into another deployment would publish there what was taken down here.
   */
  test("leaves out archived recipes", async () => {
    await insertRecipe("Deleted", { isArchived: true });
    await insertRecipe("Catalog");

    const { page: exported } = await page();

    expect(exported.map((recipe) => recipe.row.title.values.fr)).toEqual(["Catalog"]);
  });

  test("spells each ingredient out by slug, name and aliases, in position order", async () => {
    const recipeId = await insertRecipe("Soupe");
    await link(recipeId, await insertIngredient("onion", "oignon", "onion"), 2);
    await link(recipeId, await insertIngredient("carrot", "carotte", "carrot"), 1);

    const [exported] = (await page()).page;

    expect(exported?.ingredients).toEqual([
      {
        position: 1,
        quantity: 2,
        unit: "pcs",
        ingredient: {
          slug: "carrot",
          name: { values: { fr: "carotte", en: "carrot" }, meta: {} },
          aliases: { fr: ["carottes"] },
        },
      },
      {
        position: 2,
        quantity: 2,
        unit: "pcs",
        ingredient: {
          slug: "onion",
          name: { values: { fr: "oignon", en: "onion" }, meta: {} },
          aliases: { fr: ["oignons"] },
        },
      },
    ]);
  });

  /** A restore that lost the tag would count the frying oil as eaten whole on the other deployment. */
  test("carries a line's fat use, and nothing for a line without one", async () => {
    const recipeId = await insertRecipe("Japchae");
    await link(recipeId, await insertIngredient("vegetable-oil", "huile végétale", "vegetable oil"), 0, "fried");
    await link(recipeId, await insertIngredient("onion", "oignon", "onion"), 1);

    const [exported] = (await page()).page;

    expect(exported?.ingredients[0]).toMatchObject({ position: 0, fatUse: "fried" });
    expect(exported?.ingredients[1]).not.toHaveProperty("fatUse");
  });

  test("exports the cover url, and the plate with its base and offset", async () => {
    const coverImageId = await insertImage("cover.webp");
    const baseImageId = await insertImage("plate-base.webp");
    const plateImageId = await insertImage("plate.png");
    await t.run((ctx) =>
      ctx.db.insert("imageObjects", { imageId: plateImageId, baseImageId, x: 12, y: 34, updatedAt: 1 }),
    );
    await insertRecipe("Photo", { coverImageId, plateImageId });

    const [exported] = (await page()).page;

    expect(exported?.images).toEqual({
      cover: { url: "cover.webp" },
      plate: { url: "plate.png", base: { url: "plate-base.webp" }, x: 12, y: 34 },
    });
  });

  /** The restore rebuilds a plate by uploading its base and cutting from it; half a pair is no plate. */
  test("exports no plate when the cut-out has no base to be rebuilt from", async () => {
    await insertRecipe("Orphan", { plateImageId: await insertImage("plate.png") });

    const [exported] = (await page()).page;

    expect(exported?.images).toEqual({ cover: undefined, plate: undefined });
  });

  test("pages through the catalog on the cursor", async () => {
    await insertRecipe("One");
    await insertRecipe("Two");

    const first = await page(1);
    expect(first.page.map((recipe) => recipe.row.title.values.fr)).toEqual(["One"]);
    expect(first.isDone).toBe(false);

    const second = await page(1, first.continueCursor);
    expect(second.page.map((recipe) => recipe.row.title.values.fr)).toEqual(["Two"]);
  });
});
