import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";

import { CONFIDENT, MARGIN } from "@shared/ingredientMatch";

import schema from "../../../schema";
import { searchWidened } from "../searchWidened";
import { seedIngredients } from "../seedIngredients";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/**
 * The real catalog, seeded once for the whole file.
 *
 * Against fixtures this test proves nothing: the numbers `CONFIDENT` is set from are numbers about
 * *this* catalog — how close its 200-odd rows sit to each other, and how loud the noise floor is
 * for an ingredient it does not hold. Hand-written candidates would drift from it silently, which
 * is the one failure this file exists to catch. `searchWidened.test.ts` deliberately does the
 * opposite with two rows by hand, so a failure there points at the search rather than at the seed;
 * the two files are not duplicates, they are the two halves of that trade.
 *
 * It replaces the calibration block that lived in `matchIngredients.test.ts` until that function
 * was deleted. The block never tested `matchIngredients` — it tested the THRESHOLD, using it as
 * the way in. The threshold outlived it as `LINKABLE` in `resolveIngredient` step 1, so the same
 * assertions now go through `searchWidened`, which is what that step reads.
 */
let t: ReturnType<typeof convexTest>;
let slugOf: Map<string, string>;

beforeAll(async () => {
  t = convexTest(schema, modules);
  await t.run(seedIngredients);

  // `t.run` returns through Convex's serializer, which has no Map — the pairs cross as an array.
  const pairs = await t.run(async (ctx) => {
    const rows = await ctx.db.query("ingredients").collect();

    return rows.map((row) => [row._id as string, row.slug!] as const);
  });

  slugOf = new Map(pairs);
});

/**
 * `resolveIngredient`'s step 1 decision, restated over `searchWidened`'s answer.
 *
 * Restated rather than called, because `_fromCatalog` is private to `resolveIngredient` and calling
 * the exported walk would reach the datasets, the live APIs and the model — none of which may run
 * in a test, and all of which would hide which step actually answered. The predicate is two lines
 * and it is the whole subject of this file: at or above `CONFIDENT`, and clear of the runner-up by
 * `MARGIN`.
 *
 * ⚠️ If `_fromCatalog` ever stops agreeing with these two lines, this file measures a bar the app
 *    no longer applies, and every case below keeps passing while saying nothing.
 */
const linked = async (name: string, locale: "fr" | "en" = "fr") => {
  const candidates = await t.run((ctx) => searchWidened(ctx, { text: name, locale }));

  const best = candidates[0];
  const runnerUp = candidates[1]?.score ?? 0;
  if (!best || best.score < CONFIDENT || best.score - runnerUp < MARGIN) return "unmatched";

  return slugOf.get(best.ingredientId)!;
};

describe("functions/ingredients: the bar a name is linked at", () => {
  /**
   * The fixture `CONFIDENT` is tuned from. Each line is what a cook actually writes — a quantity
   * glued to the name, a preparation qualifier, a synonym the catalog records — and each has one
   * right answer. A threshold change that breaks any of these breaks recipe entry.
   */
  test.each([
    ["200g de pâtes", "pasta-dry"],
    ["pâtes", "pasta-dry"],
    ["patates", "potato"],
    ["3 oignons, émincés", "onion"],
    ["2 gousses d'ail", "garlic"],
    ["beurre doux, ramolli", "butter-unsalted"],
    ["farine", "flour-all-purpose"],
    ["sucre en poudre", "white-sugar"],
    ["oeufs", "egg-whole"],
    ["crème liquide", "heavy-cream"],
    ["huile d'olive", "olive-oil"],
    ["tomates concassées", "canned-tomatoes"],
    ["viande hachée", "ground-beef-80-20"],
    // A whole bird had no row, so step 1 declined and the ranker linked "Poulet piri piri" to
    // `chicken-breast` — the nearest thing it was offered. Wrong name, and a 400 g default where
    // the cook needed a 1.4 kg bird.
    ["poulet entier", "chicken-whole"],
    ["canard entier", "duck-whole"],
    ["fromage râpé", "emmental"],
    ["poivre noir", "black-pepper"],
    ["riz basmati", "basmati-rice"],
    ["yaourt nature", "plain-yogurt"],
    // Black olives had no row, and "olives noires" came back as `olive-oil` through its "huile" alias.
    ["olives noires", "olives-black"],
    ["olives vertes", "olives-green"],
  ])("%s links to %s", async (name, slug) => {
    expect(await linked(name)).toBe(slug);
  });

  test.each([
    ["chopped onions", "onion"],
    ["unsalted butter, softened", "butter-unsalted"],
    ["all-purpose flour, sifted", "flour-all-purpose"],
    ["fresh tomatoes", "tomato"],
    ["chicken breast", "chicken-breast"],
    ["dark chocolate", "dark-chocolate"],
  ])("%s links to %s in English", async (name, slug) => {
    expect(await linked(name, "en")).toBe(slug);
  });

  /**
   * The other half of the threshold, and the more expensive half to get wrong: an ingredient the
   * catalog does not hold must link to nothing rather than to its nearest-spelled row. A wrong link
   * corrupts the recipe's nutrition total and its grocery line, and reports no error anywhere.
   *
   * These four now reach `resolveIngredient`'s later steps instead of being dropped, which is the
   * point of the resolve slice — but they must still not be LINKED here, at step 1, with nobody
   * asked.
   */
  test.each(["sumac", "kombu", "quatre-quarts breton"])(
    "%s is not linked to its nearest row",
    async (name) => {
      expect(await linked(name)).toBe("unmatched");
    },
  );

  /**
   * `Blanc de poulet` and `Blanc de poulet en tranches` reduce to the same two words once the
   * portion word is stripped, so both score at or above the bar — raw chicken and deli slices, told
   * apart by whichever the search index returned first. `MARGIN` is what stops that coin flip being
   * linked with nobody asked; the name goes on to the steps that can weigh it instead.
   */
  test("a tie at the top is not linked, and both rows are still returned as evidence", async () => {
    const candidates = await t.run((ctx) =>
      searchWidened(ctx, { text: "blanc de poulet", locale: "fr" }),
    );

    expect(await linked("blanc de poulet")).toBe("unmatched");
    expect(candidates[0]!.score).toBeGreaterThanOrEqual(CONFIDENT);
    expect(candidates.map(({ ingredientId }) => slugOf.get(ingredientId))).toEqual(
      expect.arrayContaining(["chicken-breast", "chicken-slices"]),
    );
  });

  test("an empty catalog returns no candidates at all", async () => {
    const empty = convexTest(schema, modules);
    const candidates = await empty.run((ctx) =>
      searchWidened(ctx, { text: "pâtes", locale: "fr" }),
    );

    expect(candidates).toEqual([]);
  });
});
