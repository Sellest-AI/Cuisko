import { convexTest, type TestConvex } from "convex-test";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import type { Id } from "@convex/_generated/dataModel";
import type { PortableRecipe } from "@convex/schema/recipePayloads";
import { facetsOf } from "@shared/tags";

import { internal } from "../../../_generated/api";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/**
 * The resolver is mocked, as `createOne.test.ts` mocks it: what it does with a name is its own
 * test's business. What only this file can see is the wiring around it — that every exported line
 * reaches it in position order, that its answer comes back stamped with the exported positions, and
 * that a page the catalog holds never reaches it at all.
 */
const resolveRun = vi.hoisted(() => vi.fn());

vi.mock("@convex/functions/recipes/resolveRecipeIngredients", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../functions/recipes/resolveRecipeIngredients")>();
  return { ...actual, resolveRecipeIngredients: resolveRun };
});

/**
 * The upload is mocked too: past it lie `sharp` and the bucket, real I/O this project does not
 * stub, and which photo survives a failure is `uploadRestoredImages`'s own test. What this file
 * checks is when it is called, and what happens to its ids after.
 */
const uploadRun = vi.hoisted(() => vi.fn());

vi.mock("@convex/functions/recipes/uploadRestoredImages", () => ({ uploadRestoredImages: uploadRun }));

/** The write, passed through to the real one unless a test makes it throw. */
const persistRun = vi.hoisted(() => vi.fn());

vi.mock("@convex/functions/recipes/persistRestoredRecipe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../functions/recipes/persistRestoredRecipe")>();
  persistRun.mockImplementation(actual.persistRestoredRecipe);
  return { ...actual, persistRestoredRecipe: persistRun };
});

let t: TestConvex<typeof schema>;

/** The narrow warm-up `createOne.test.ts` explains: the graph this file exercises, loaded once. */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/recipes/restoreOne"))
      .map(([, load]) => load()),
  ),
);

const insertIngredient = (slug: string, fr: string) =>
  t.run((ctx) =>
    ctx.db.insert("ingredients", {
      slug,
      name: { values: { fr }, meta: {} },
      search: { fr, en: "" },
      emoji: "x",
      category: "VEGETABLE",
      defaultUnit: "pcs",
      defaultQuantity: 1,
      nutrition: { calories: 1, protein: 0, fat: 0, carbohydrates: 0 },
      updatedAt: 1,
    }),
  );

/** A portable recipe as a zip holds it, with its lines deliberately out of position order. */
const portable = (sourceUrl = "https://example.com/soupe"): PortableRecipe => ({
  origin: { recipeId: "other-deployment-id", creationTime: 1 },
  row: {
    title: { values: { fr: "Soupe" }, meta: {} },
    description: { values: { fr: "" }, meta: {} },
    instructions: { values: { fr: "- Cuire." }, meta: {} },
    servings: 4,
    equipments: [],
    difficulty: 1,
    tags: ["vegan"],
    cuisine: "french",
    timings: {},
    search: { fr: "", en: "" },
    ...facetsOf(["vegan"]),
    sourceUrl,
    updatedAt: 1,
  },
  ingredients: [
    { position: 3, quantity: 1, unit: "pcs", ingredient: { slug: "onion", name: { values: { fr: "oignon" }, meta: {} } } },
    { position: 1, quantity: 2, unit: "pcs", ingredient: { name: { values: { fr: "poivron vert" }, meta: {} } } },
  ],
  images: {},
});

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

const NO_PHOTOS = { uploaded: {}, kept: [], stranded: [] };
const PHOTOS = { cover: "COVER", plate: "PLATE", plateBase: "BASE" };

beforeEach(() => {
  t = convexTest(schema, modules);
  resolveRun.mockReset();
  uploadRun.mockReset().mockResolvedValue(NO_PHOTOS);
});

describe("router/recipes/restoreOne", () => {
  test("resolves the lines in position order and stamps the links with the exported positions", async () => {
    const pepper = await insertIngredient("green-pepper", "poivron vert");
    const onion = await insertIngredient("onion", "oignon");
    // The resolver answers by index into the list it was handed: the pepper (position 1) is
    // first, the onion (position 3) second.
    resolveRun.mockResolvedValue({
      links: [
        { ingredientId: pepper, position: 0, quantity: 2, unit: "pcs" },
        { ingredientId: onion, position: 1, quantity: 1, unit: "pcs" },
      ],
      complete: true,
    });

    const { recipeId, created, unmatched } = await t.action(internal.router.recipes.restoreOne._internal, {
      recipe: portable(),
      photos: {},
    });

    expect({ created, unmatched }).toEqual({ created: true, unmatched: [] });
    expect(resolveRun).toHaveBeenCalledWith(
      expect.anything(),
      {
        recipe: {
          ingredients: [
            { name: "poivron vert", quantity: 2, unit: "pcs" },
            { name: "oignon", quantity: 1, unit: "pcs" },
          ],
        },
        locale: "fr",
      },
    );
    const lines = await t.run((ctx) =>
      ctx.db.query("recipeIngredients").withIndex("by_recipe", (q) => q.eq("recipeId", recipeId)).collect(),
    );
    expect(lines.map((line) => [line.position, line.ingredientId]).sort()).toEqual([
      [1, pepper],
      [3, onion],
    ]);
  });

  test("reports a line the resolver refused, by its exported name, and drops it", async () => {
    const onion = await insertIngredient("onion", "oignon");
    resolveRun.mockResolvedValue({
      links: [{ ingredientId: onion, position: 1, quantity: 1, unit: "pcs" }],
      complete: true,
    });

    const { recipeId, unmatched } = await t.action(internal.router.recipes.restoreOne._internal, {
      recipe: portable(),
      photos: {},
    });

    expect(unmatched).toEqual(["poivron vert"]);
    const lines = await t.run((ctx) =>
      ctx.db.query("recipeIngredients").withIndex("by_recipe", (q) => q.eq("recipeId", recipeId)).collect(),
    );
    expect(lines).toHaveLength(1);
  });

  /** The page's presence is asked before the walk, because the walk is the part that costs. */
  test("returns the existing recipe without resolving when the catalog holds the page", async () => {
    resolveRun.mockResolvedValue({ links: [], complete: true });
    const first = await t.action(internal.router.recipes.restoreOne._internal, { recipe: portable(), photos: {} });
    resolveRun.mockClear();

    const second = await t.action(internal.router.recipes.restoreOne._internal, { recipe: portable(), photos: {} });

    expect(second).toEqual({ recipeId: first.recipeId, created: false, unmatched: [] });
    expect(resolveRun).not.toHaveBeenCalled();
    const recipes = await t.run((ctx) => ctx.db.query("recipes").withIndex("by_user").collect());
    expect(recipes).toHaveLength(1);
  });

  test("a recipe with no sourceUrl is written every time, as there is nothing to guard on", async () => {
    resolveRun.mockResolvedValue({ links: [], complete: true });
    const recipe = portable();
    delete recipe.row.sourceUrl;

    const first = await t.action(internal.router.recipes.restoreOne._internal, { recipe, photos: {} });
    const second = await t.action(internal.router.recipes.restoreOne._internal, { recipe, photos: {} });

    expect(first.recipeId).not.toBe(second.recipeId as Id<"recipes">);
  });

  test("uploads the photos for a new page and attaches them, and uploads nothing for a held one", async () => {
    resolveRun.mockResolvedValue({ links: [], complete: true });
    const coverImageId = await insertImage("cover.webp");
    const plateImageId = await insertImage("plate.png");
    uploadRun.mockResolvedValue({ uploaded: { coverImageId, plateImageId }, kept: [coverImageId, plateImageId], stranded: [] });

    const { recipeId } = await t.action(internal.router.recipes.restoreOne._internal, { recipe: portable(), photos: PHOTOS });
    uploadRun.mockClear();
    await t.action(internal.router.recipes.restoreOne._internal, { recipe: portable(), photos: PHOTOS });

    expect(uploadRun).not.toHaveBeenCalled();
    const recipe = await t.run((ctx) => ctx.db.get(recipeId));
    expect(recipe).toMatchObject({ coverImageId, plateImageId });
  });

  test("discards the uploads when the write throws, and a stranded base either way", async () => {
    resolveRun.mockResolvedValue({ links: [], complete: true });
    const coverImageId = await insertImage("cover.webp");
    const baseImageId = await insertImage("plate-base.webp");
    uploadRun.mockResolvedValue({ uploaded: { coverImageId }, kept: [coverImageId], stranded: [baseImageId] });
    persistRun.mockRejectedValueOnce(new Error("write failed"));

    await expect(
      t.action(internal.router.recipes.restoreOne._internal, { recipe: portable(), photos: PHOTOS }),
    ).rejects.toThrow("write failed");

    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    const deleted = scheduled.map((job) => job.args[0]);
    expect(deleted).toContainEqual({ imageId: coverImageId });
    expect(deleted).toContainEqual({ imageId: baseImageId });
    const recipes = await t.run((ctx) => ctx.db.query("recipes").withIndex("by_user").collect());
    expect(recipes).toHaveLength(0);
  });

  test("throws before any upload or write when the resolver did not finish", async () => {
    resolveRun.mockResolvedValue({ links: [], complete: false });

    await expect(
      t.action(internal.router.recipes.restoreOne._internal, { recipe: portable(), photos: PHOTOS }),
    ).rejects.toThrow("could not be resolved");

    expect(uploadRun).not.toHaveBeenCalled();
    const recipes = await t.run((ctx) => ctx.db.query("recipes").withIndex("by_user").collect());
    expect(recipes).toHaveLength(0);
  });
});
