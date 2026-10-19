import { convexTest, type TestConvex } from "convex-test";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import type { Id } from "@convex/_generated/dataModel";
import type { PortableIngredient } from "@convex/schema/ingredientPayloads";

import { drainScheduled } from "../../../__tests__/scheduler.fixtures";
import { internal } from "../../../_generated/api";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/**
 * The upload is mocked: past it lie `sharp` and the bucket, real I/O this project does not stub.
 * Each call hands back the next image row the test inserted, or throws when a test says so. What
 * this file checks is when it is called, and what happens to its ids after.
 */
const uploadRun = vi.hoisted(() => vi.fn());

vi.mock("@convex/functions/media/uploadImage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../functions/media/uploadImage")>();
  return { ...actual, uploadManyImages: uploadRun };
});

/** The bucket a discarded base is removed from — mocked for the same reason the upload is. */
const deleteFile = vi.hoisted(() => vi.fn());

vi.mock("@convex/lib/s3/node", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/s3/node")>();
  return { ...actual, StorageCloud: { ...actual.StorageCloud, deleteFile } };
});

let t: TestConvex<typeof schema>;

/**
 * The narrow warm-up `createOne.test.ts` explains: the graph this file exercises, loaded once. The
 * image routers are in it because the action reaches the upload one once the row is written, and a
 * first test paying for that import times out under a full run. They are in it as a folder because
 * the discard a failed cut-out schedules reaches several of them, and the drain gives up on a job
 * still importing one: a router missing from a hand-kept list would fail only on a slow runner.
 */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) =>
        ["/convex/router/ingredients/restoreOne", "/convex/router/media/images/"].some((graph) => path.startsWith(graph)),
      )
      .map(([, load]) => load()),
  ),
);

const insertImage = (url: string) =>
  t.run((ctx) =>
    ctx.db.insert("images", {
      hasAlpha: true,
      key: `public/${url}`,
      url,
      width: 512,
      height: 512,
      size: 10_000,
      mimeType: "image/png",
      tags: ["IMAGE"],
      updatedAt: 1,
    }),
  );

/** The next uploads return these rows, in order. */
const uploadsReturn = (...imageIds: Id<"images">[]) => {
  for (const imageId of imageIds) uploadRun.mockResolvedValueOnce([{ _id: imageId }]);
};

const portable = (overrides: Partial<PortableIngredient["row"]> = {}): PortableIngredient => ({
  origin: { ingredientId: "other-deployment-id", creationTime: 1 },
  row: {
    slug: "carrot",
    name: {
      values: { fr: "Carotte", en: "Carrot" },
      meta: { fr: { status: "edited", sourceHash: "a" }, en: { status: "edited", sourceHash: "b" } },
    },
    aliases: { fr: ["carottes"] },
    emoji: "🥕",
    category: "VEGETABLE",
    diet: "vegan",
    allergens: [],
    source: "seed",
    defaultUnit: "pcs",
    defaultQuantity: 1,
    nutrition: { calories: 41, protein: 1, fat: 0.2, saturatedFat: 0, carbohydrates: 10, sugars: 5, fiber: 3, sodium: 60 },
    ...overrides,
  },
  image: { url: "image.png", base: { url: "image-base.webp" }, x: 5, y: 6 },
});

const FILES = { image: "Y3V0", base: "YmFzZQ==" };

const restore = (ingredient = portable(), { image }: { image?: typeof FILES } = { image: FILES }) =>
  t.action(internal.router.ingredients.restoreOne._internal, { ingredient, image });

const insertExisting = (imageId?: Id<"images">) =>
  t.run(async (ctx) => {
    const id = await ctx.db.insert("ingredients", {
      slug: "carrot",
      name: { values: { fr: "Carotte maison", en: "Home carrot" }, meta: {} },
      search: { fr: "carotte maison", en: "home carrot" },
      emoji: "🥕",
      imageId,
      category: "VEGETABLE",
      defaultUnit: "kg",
      defaultQuantity: 2,
      nutrition: { calories: 1, protein: 0, fat: 0, carbohydrates: 0 },
      updatedAt: 1,
    });

    return id;
  });

const scheduledDeletes = () =>
  t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect()).filter(({ name }) => name.includes("deleteOne")),
  );

beforeEach(() => {
  t = convexTest(schema, modules);
  uploadRun.mockReset();
  deleteFile.mockReset();
});

describe("restoreOne._internal", () => {
  test("inserts a new ingredient with its image uploaded as a cut-out on its base", async () => {
    const [base, cutout] = [await insertImage("base.webp"), await insertImage("cut.png")];
    uploadsReturn(base, cutout);

    const { ingredientId, outcome } = await restore();

    expect(outcome).toBe("created");
    const row = await t.run((ctx) => ctx.db.get(ingredientId));
    expect(row).toMatchObject({ slug: "carrot", imageId: cutout, diet: "vegan", search: { fr: "carotte carottes" } });
    expect(row?.nutriScore).toBeDefined();
    expect(uploadRun.mock.calls.map(([, args]) => args.images[0])).toEqual([
      { base64: FILES.base },
      { base64: FILES.image, object: { baseImageId: base, x: 5, y: 6 } },
    ]);
  });

  /** "Fill missing image": the row keeps every fact it has, and only gains the picture. */
  test("attaches the image to a matching row that has none, and changes nothing else", async () => {
    const existingId = await insertExisting();
    const [base, cutout] = [await insertImage("base.webp"), await insertImage("cut.png")];
    uploadsReturn(base, cutout);

    const { ingredientId, outcome } = await restore();

    expect({ ingredientId, outcome }).toEqual({ ingredientId: existingId, outcome: "imageAdded" });
    const row = await t.run((ctx) => ctx.db.get(existingId));
    expect(row).toMatchObject({ imageId: cutout, defaultUnit: "kg", name: { values: { fr: "Carotte maison" } } });
  });

  test("uploads nothing for a matching row that already has an image", async () => {
    const kept = await insertImage("kept.png");
    const existingId = await insertExisting(kept);

    const result = await restore();

    expect(result).toEqual({ ingredientId: existingId, outcome: "existing" });
    expect(uploadRun).not.toHaveBeenCalled();
    expect((await t.run((ctx) => ctx.db.get(existingId)))?.imageId).toBe(kept);
  });

  /** A row the app grew from a cook's typing has no slug; its exact name is its identity. */
  test("matches a row with no slug by its exact name", async () => {
    const existingId = await insertExisting(await insertImage("kept.png"));

    const result = await restore(portable({ slug: undefined, name: { values: { fr: "Carotte maison" }, meta: {} } }));

    expect(result).toEqual({ ingredientId: existingId, outcome: "existing" });
  });

  test("restores the row without an image when the cut-out fails, and discards its base", async () => {
    const base = await insertImage("base.webp");
    uploadsReturn(base);
    uploadRun.mockRejectedValueOnce(new Error("sharp exploded"));

    const { ingredientId, outcome } = await restore();

    expect(outcome).toBe("created");
    expect((await t.run((ctx) => ctx.db.get(ingredientId)))?.imageId).toBeUndefined();
    expect((await scheduledDeletes()).map(({ args }) => args[0])).toEqual([{ imageId: base }]);

    await drainScheduled(t);

    expect(deleteFile.mock.calls).toEqual([["public/base.webp"]]);
    expect(await t.run((ctx) => ctx.db.get(base))).toBeNull();
  });

  test("restores the row without an image when the zip carried none, uploading nothing", async () => {
    const { outcome } = await restore(portable(), {});

    expect(outcome).toBe("created");
    expect(uploadRun).not.toHaveBeenCalled();
  });

  /** Written before anything is uploaded: a row the restore refuses costs no upload at all. */
  test("refuses a row with no diet before uploading anything", async () => {
    await expect(restore(portable({ diet: undefined }))).rejects.toThrow("Carotte has no diet");

    expect(uploadRun).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.query("ingredients").withIndex("by_slug").take(1))).toHaveLength(0);
  });
});
