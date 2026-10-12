import { convexTest, type TestConvex } from "convex-test";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";

import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { PortableRecipe } from "@convex/schema/recipePayloads";
import { searchTextOf } from "@shared/search";
import { facetsOf } from "@shared/tags";

import schema from "../../../schema";
import { exportCatalog } from "../exportCatalog";
import { recipeSearchText } from "../recipeSearchText";
import type { RecipeLink } from "../resolveRecipeIngredients";

const modules = import.meta.glob("/convex/**/*.*s");

/** Imports the module under test before any test is timed — see router/preferences/__tests__/getPlanningSeed.test.ts. */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/recipes/restoreOne."))
      .map(([, load]) => load()),
  ),
);

type Deployment = TestConvex<typeof schema>;

/** Two deployments: the one the zip was exported from, and the one it is restored into. */
let origin: Deployment;
let target: Deployment;

/** The catalog every deployment is seeded with, keyed by slug. */
const seedCatalog = (t: Deployment) =>
  t.run(async (ctx) => {
    const row = (slug: string, fr: string, en: string) =>
      ctx.db.insert("ingredients", {
        slug,
        name: { values: { fr, en }, meta: {} },
        search: { fr: searchTextOf([fr]), en: searchTextOf([en]) },
        emoji: "x",
        category: "VEGETABLE",
        defaultUnit: "pcs",
        defaultQuantity: 1,
        nutrition: { calories: 1, protein: 0, fat: 0, carbohydrates: 0 },
        updatedAt: 1,
      });

    return { carrot: await row("carrot", "carotte", "carrot"), onion: await row("onion", "oignon", "onion") };
  });

const insertImage = (t: Deployment, url: string) =>
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

/** A catalog recipe on `origin` with linked lines, written as `saveRecipe` would have. */
const insertOriginal = (ingredientIds: Id<"ingredients">[], sourceUrl = "https://example.com/soupe") =>
  origin.run(async (ctx) => {
    const search = await recipeSearchText(ctx, { ingredientIds, names: [] });
    const recipeId = await ctx.db.insert("recipes", {
      status: "generated",
      isArchived: false,
      title: { values: { fr: "Soupe", en: "Soup" }, meta: { en: { status: "machine", sourceHash: "h" } } },
      description: { values: { fr: "Une soupe.", en: "A soup." }, meta: {} },
      instructions: { values: { fr: "- Cuire.", en: "- Cook." }, meta: {} },
      servings: 4,
      equipments: [],
      difficulty: 2,
      tags: ["vegan", "quick"],
      cuisine: "french",
      timings: { cooking: 20 },
      search,
      ...facetsOf(["vegan", "quick"]),
      shuffleKey: 0.25,
      sourceUrl,
      updatedAt: 1,
    });
    for (const [position, ingredientId] of ingredientIds.entries()) {
      await ctx.db.insert("recipeIngredients", { recipeId, ingredientId, position, quantity: 1, unit: "pcs", updatedAt: 1 });
    }

    return recipeId;
  });

const exportFirst = async (): Promise<PortableRecipe> => {
  const { page } = await origin.run((ctx) => exportCatalog(ctx, { paginationOpts: { cursor: null, numItems: 1 } }));

  return page[0]!;
};

/** The links the action would have resolved: each exported line onto a target row, by position. */
const linksOnto = (recipe: PortableRecipe, ids: Id<"ingredients">[]): RecipeLink[] =>
  recipe.ingredients.slice(0, ids.length).map(({ position, quantity, unit }, index) => ({
    ingredientId: ids[index]!,
    position,
    quantity,
    unit,
  }));

type Persist = { links?: RecipeLink[]; unmatched?: string[]; coverImageId?: Id<"images">; plateImageId?: Id<"images"> };

/**
 * Through the one mutation that calls it, so the ctx is the traced one the builder makes: the
 * helper schedules `generateImages` with `scheduleTracedAfter`, which a bare `t.run` ctx lacks.
 */
const persist = (recipe: PortableRecipe, { links = [], unmatched = [], ...images }: Persist = {}) =>
  target.mutation(internal.router.recipes.restoreOne._internal_persist, { recipe, links, unmatched, ...images });

const loadRestored = (recipeId: Id<"recipes">) =>
  target.run(async (ctx) => ({
    recipe: (await ctx.db.get(recipeId))!,
    lines: await ctx.db
      .query("recipeIngredients")
      .withIndex("by_recipe", (q) => q.eq("recipeId", recipeId))
      .collect(),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));

beforeEach(() => {
  origin = convexTest(schema, modules);
  target = convexTest(schema, modules);
});

describe("persistRestoredRecipe", () => {
  test("round trip: the restored recipe has the same text, tags, facets and search", async () => {
    const seeds = await seedCatalog(origin);
    await insertOriginal([seeds.carrot, seeds.onion]);
    const exported = await exportFirst();
    const targetSeeds = await seedCatalog(target);

    const { recipeId, created } = await persist(exported, {
      links: linksOnto(exported, [targetSeeds.carrot, targetSeeds.onion]),
    });
    const { recipe, lines } = await loadRestored(recipeId);

    expect(created).toBe(true);
    const { shuffleKey: _shuffle, updatedAt: _updated, ...restoredRow } = recipe;
    const { shuffleKey: _exportedShuffle, updatedAt: _exportedUpdated, ...exportedRow } = exported.row;
    expect(restoredRow).toMatchObject(exportedRow);
    expect(recipe.userId).toBeUndefined();
    // The links point at THIS deployment's rows, in the exported positions.
    expect(lines.map((line) => [line.position, line.ingredientId])).toEqual([
      [0, targetSeeds.carrot],
      [1, targetSeeds.onion],
    ]);
  });

  /**
   * The harira's own path: the catalog import. Two exported lines ("cumin seeds", "ground cumin")
   * resolving to one row on this deployment are stored as one line, summed.
   */
  test("folds two exported lines that resolve to one row into one line", async () => {
    const seeds = await seedCatalog(origin);
    await insertOriginal([seeds.carrot, seeds.onion]);
    const exported = await exportFirst();
    const targetSeeds = await seedCatalog(target);

    const { recipeId } = await persist(exported, {
      links: linksOnto(exported, [targetSeeds.carrot, targetSeeds.carrot]),
    });
    const { lines } = await loadRestored(recipeId);

    expect(lines.map(({ ingredientId, position, quantity, unit }) => ({ ingredientId, position, quantity, unit }))).toEqual([
      { ingredientId: targetSeeds.carrot, position: 0, quantity: 2, unit: "pcs" },
    ]);
  });

  test("gives the recipe a shuffle key of its own", async () => {
    const seeds = await seedCatalog(origin);
    await insertOriginal([seeds.carrot]);
    const exported = await exportFirst();

    const { recipe } = await loadRestored((await persist(exported)).recipeId);

    expect(recipe.shuffleKey).toBeDefined();
    expect(recipe.shuffleKey).not.toBe(exported.row.shuffleKey);
  });

  /**
   * A review is a fact about the recipe, so it travels: a catalog recipe checked on one deployment
   * is not unchecked on the next. An export from before the column existed restores as `generated`,
   * which is what it was. Live either way — no recipe is restored deleted.
   */
  test("keeps the exported review status, and restores the recipe live", async () => {
    const seeds = await seedCatalog(origin);
    await insertOriginal([seeds.carrot]);
    const exported = await exportFirst();

    const reviewed = await persist({ ...exported, row: { ...exported.row, status: "reviewed", isArchived: true } });
    const legacy = await persist({
      ...exported,
      row: { ...exported.row, status: undefined, sourceUrl: "https://example.com/other" },
    });

    const rows = await Promise.all([reviewed, legacy].map(({ recipeId }) => loadRestored(recipeId)));

    expect(rows.map(({ recipe }) => [recipe.status, recipe.isArchived])).toEqual([
      ["reviewed", false],
      ["generated", false],
    ]);
  });

  test("keeps an unmatched line's spelling searchable, with no row for it", async () => {
    const seeds = await seedCatalog(origin);
    await insertOriginal([seeds.carrot, seeds.onion]);
    const exported = await exportFirst();
    const targetSeeds = await seedCatalog(target);

    const { recipeId } = await persist(exported, {
      links: linksOnto(exported, [targetSeeds.carrot]),
      unmatched: ["oignon"],
    });
    const { recipe, lines } = await loadRestored(recipeId);

    expect(lines).toHaveLength(1);
    expect(recipe.search.fr).toContain("oignon");
  });

  test("returns the existing recipe without inserting when the catalog already holds the page", async () => {
    const seeds = await seedCatalog(origin);
    await insertOriginal([seeds.carrot]);
    const exported = await exportFirst();
    const first = await persist(exported);

    const second = await persist(exported);
    const recipes = await target.run((ctx) => ctx.db.query("recipes").withIndex("by_user").collect());

    expect(second).toEqual({ recipeId: first.recipeId, created: false });
    expect(recipes).toHaveLength(1);
  });

  test("queues the uploaded photos for deletion when the page was already there", async () => {
    const seeds = await seedCatalog(origin);
    await insertOriginal([seeds.carrot]);
    const exported = await exportFirst();
    await persist(exported, { coverImageId: await insertImage(target, "first.webp") });

    const orphan = await insertImage(target, "orphan.webp");
    const { recipeId } = await persist(exported, { coverImageId: orphan });
    const { scheduled } = await loadRestored(recipeId);

    expect(scheduled.map((job) => job.args[0])).toContainEqual({ imageId: orphan });
  });

  test("schedules the photos when the export had none, and not when it had both", async () => {
    const seeds = await seedCatalog(origin);
    await insertOriginal([seeds.carrot]);
    const exported = await exportFirst();

    const bare = await persist(exported);
    const { scheduled } = await loadRestored(bare.recipeId);
    expect(scheduled.map((job) => job.args[0])).toContainEqual({ recipeId: bare.recipeId });

    const photographed = await persist(
      { ...exported, row: { ...exported.row, sourceUrl: "https://example.com/other" } },
      { coverImageId: await insertImage(target, "c.webp"), plateImageId: await insertImage(target, "p.png") },
    );
    const after = await loadRestored(photographed.recipeId);
    expect(after.recipe.coverImageId).toBeDefined();
    expect(after.scheduled.map((job) => job.args[0])).not.toContainEqual({ recipeId: photographed.recipeId });
  });

  test("schedules the photos when only one of the two arrived, whichever it is", async () => {
    const seeds = await seedCatalog(origin);
    await insertOriginal([seeds.carrot]);
    const exported = await exportFirst();
    const at = (sourceUrl: string) => ({ ...exported, row: { ...exported.row, sourceUrl } });

    const coverOnly = await persist(at("https://example.com/cover"), { coverImageId: await insertImage(target, "c.webp") });
    const plateOnly = await persist(at("https://example.com/plate"), { plateImageId: await insertImage(target, "p.png") });
    const { scheduled } = await loadRestored(coverOnly.recipeId);

    const jobs = scheduled.map((job) => job.args[0]);
    expect(jobs).toContainEqual({ recipeId: coverOnly.recipeId });
    expect(jobs).toContainEqual({ recipeId: plateOnly.recipeId });
  });

  test("stores the sourceUrl canonical, so a later import of the page finds it", async () => {
    const seeds = await seedCatalog(origin);
    await insertOriginal([seeds.carrot]);
    const exported = await exportFirst();
    const tracked = { ...exported, row: { ...exported.row, sourceUrl: "https://example.com/soupe?utm_source=x#avis" } };

    const first = await persist(tracked);
    const second = await persist(exported);

    const { recipe } = await loadRestored(first.recipeId);
    expect(recipe.sourceUrl).toBe("https://example.com/soupe");
    expect(second).toEqual({ recipeId: first.recipeId, created: false });
  });
});
