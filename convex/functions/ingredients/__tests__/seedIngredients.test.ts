import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import { isAllergen, sortAllergens } from "@shared/allergens";
import { DIETS } from "@shared/diets";

import schema from "../../../schema";
import { CATALOG } from "../ingredientCatalog";
import { seedIngredients } from "../seedIngredients";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

beforeEach(() => {
  t = convexTest(schema, modules);
});

const rows = () => t.run((ctx) => ctx.db.query("ingredients").collect());

const bySlug = async (slug: string) => {
  const all = await rows();
  return all.find((row) => row.slug === slug);
};

/**
 * The catalog is data, and these assert the data rather than the code that writes it.
 *
 * They belong here and not in a check script because the invariant they protect is the one
 * `seedIngredients` throws on: a row that cannot say what diet it is for. Catching that in a test
 * run means catching it before the seed is executed against a real deployment, which is the only
 * place the throw would otherwise surface.
 */
describe("the catalog data", () => {
  test("gives every row a diet, so the seed never throws on it", () => {
    const undeclared = CATALOG.filter((entry) => !entry.diet);

    expect(undeclared.map((entry) => `${entry.slug} (${entry.category})`)).toEqual([]);
  });

  test("gives every row a diet from the vocabulary", () => {
    for (const entry of CATALOG) expect(DIETS).toContain(entry.diet);
  });

  /**
   * `allergens` is never `undefined` on a catalog row, and that is load-bearing: `undefined` means
   * "nobody has classified this" and would cost every recipe containing the row its free-from tags.
   * A catalog row carrying nothing must say so with `[]`.
   */
  test("gives every row an allergen list, empty rather than absent", () => {
    for (const entry of CATALOG) {
      expect(Array.isArray(entry.allergens)).toBe(true);
      for (const allergen of entry.allergens) expect(isAllergen(allergen)).toBe(true);
    }
  });

  test("has no duplicate slugs, so the upsert cannot collide", () => {
    const slugs = CATALOG.map((entry) => entry.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
  });

  /** The three the bug was about: none of them is legible from its category. */
  test.each([
    ["honey", "vegetarian"],
    ["worcestershire-sauce", "pescatarian"],
    ["gelatin", "omnivore"],
    ["chicken-broth", "omnivore"],
  ])("does not call %s a plant", (slug, diet) => {
    expect(CATALOG.find((entry) => entry.slug === slug)?.diet).toBe(diet);
  });

  test.each([
    ["pasta-dry", "gluten"],
    ["soy-sauce", "gluten"],
    ["peanut-butter", "peanuts"],
    ["almond-milk", "nuts"],
    ["cheddar-cheese", "milk"],
  ])("records that %s carries %s", (slug, allergen) => {
    expect(CATALOG.find((entry) => entry.slug === slug)?.allergens).toContain(allergen);
  });

  /** Rice is the row a "GRAIN means gluten" rule would have got wrong. */
  test.each(["white-rice", "quinoa", "polenta", "cornstarch"])(
    "does not record gluten against %s",
    (slug) => {
      expect(CATALOG.find((entry) => entry.slug === slug)?.allergens).not.toContain("gluten");
    },
  );
});

describe("functions/ingredients/seedIngredients", () => {
  test("writes the whole catalog on a first run", async () => {
    const result = await t.run(seedIngredients);

    expect(result).toEqual({ created: CATALOG.length, updated: 0, total: CATALOG.length });
    expect(await rows()).toHaveLength(CATALOG.length);
  });

  /** The property the whole `slug` field exists for: editing the catalog re-runs, not duplicates. */
  test("updates in place on a second run rather than duplicating", async () => {
    await t.run(seedIngredients);
    const result = await t.run(seedIngredients);

    expect(result).toEqual({ created: 0, updated: CATALOG.length, total: CATALOG.length });
    expect(await rows()).toHaveLength(CATALOG.length);
  });

  test("writes the diet and the allergens onto every row", async () => {
    await t.run(seedIngredients);

    for (const row of await rows()) {
      expect(DIETS).toContain(row.diet);
      expect(row.allergens).toBeDefined();
    }
  });

  /** `sortAllergens` de-duplicates as well as orders, so one comparison asserts both. */
  test("stores an allergen list that is canonically ordered and free of repeats", async () => {
    await t.run(seedIngredients);

    for (const row of await rows()) {
      const allergens = row.allergens ?? [];
      expect(allergens).toEqual(sortAllergens(allergens));
    }
  });

  /**
   * The category baseline and the per-slug list are MERGED, not replaced. Puff pastry is the row
   * that proves it: `gluten` comes from its slug, and a naive replace on a dairy row would drop the
   * `milk` the category contributes.
   */
  test("merges the per-slug allergens with the category baseline", async () => {
    await t.run(seedIngredients);

    expect((await bySlug("puff-pastry"))?.allergens).toEqual(
      expect.arrayContaining(["gluten", "milk"]),
    );
    // A DAIRY row with no entry of its own still gets `milk` from its category.
    expect((await bySlug("brie"))?.allergens).toEqual(["milk"]);
  });

  test("leaves a row that carries nothing with an empty list, not an absent one", async () => {
    await t.run(seedIngredients);

    expect((await bySlug("carrot"))?.allergens).toEqual([]);
  });
});

/**
 * Re-seeding is how a catalog edit ships, and it patches the WHOLE row — so it is also the write
 * that can quietly undo what the app learned between two seeds.
 *
 * `rememberAlias` caches a word onto the row the ranker matched it to, precisely so the next
 * shopper who types it is answered by the search rather than by a paid model call. Those rows are
 * overwhelmingly seeded ones, since seeded rows are what the near-miss candidates come from. A seed
 * that wrote `entry.aliases` alone would reset the cache on every run, with no error and no symptom
 * but a bill that came back.
 */
describe("functions/ingredients/seedIngredients — re-seeding a learned row", () => {
  test("keeps the aliases the app learned, and the catalog's own", async () => {
    await t.run(seedIngredients);

    const carrot = await bySlug("carrot");
    const seeded = carrot?.aliases?.en ?? [];

    await t.run((ctx) =>
      ctx.db.patch(carrot!._id, { aliases: { ...carrot!.aliases, en: [...seeded, "gulerod"] } }),
    );

    await t.run(seedIngredients);

    const reseeded = await bySlug("carrot");

    // The learned word survives, and the catalog's own are still there and still first.
    expect(reseeded?.aliases?.en).toEqual([...seeded, "gulerod"]);
    // And it is reachable, which is the only form of "kept" that matters (ADR 0011).
    expect(reseeded?.search?.en).toContain("gulerod");
  });
});
