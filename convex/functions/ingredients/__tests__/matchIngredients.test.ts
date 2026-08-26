import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";

import { CONFIDENT } from "@shared/ingredientMatch";

import schema from "../../../schema";
import { matchIngredients } from "../matchIngredients";
import { seedIngredients } from "../seedIngredients";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/**
 * The real catalog, seeded once for the whole file.
 *
 * Against fixtures this test proves nothing: the numbers `CONFIDENT` is set from are numbers about
 * *this* catalog — how close its 200-odd rows sit to each other, and how loud the noise floor is
 * for an ingredient it does not hold. Hand-written candidates would drift from it silently, which
 * is the one failure this file exists to catch.
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

const match = (names: string[], locale: "fr" | "en" = "fr") =>
  t.run((ctx) => matchIngredients(ctx, { names, locale }));

/** A result read as "which slug, if any" — the assertion every case below is really making. */
const resolved = async (name: string, locale: "fr" | "en" = "fr") => {
  const [result] = await match([name], locale);
  if (!result) throw new Error(`no result for ${name}`);

  return result.status === "matched" ? slugOf.get(result.ingredientId)! : result.status;
};

describe("matchIngredients", () => {
  test("a confident line returns its row", async () => {
    const [result] = await match(["200g de pâtes"]);

    expect(result).toMatchObject({ status: "matched", name: "200g de pâtes" });
    expect(slugOf.get((result as { ingredientId: string }).ingredientId)).toBe("pasta-dry");
  });

  test("resolves every name in one call, independently", async () => {
    const results = await match(["oignon", "sumac", "beurre doux"]);

    expect(results.map(({ status }) => status)).toEqual(["matched", "unmatched", "matched"]);
  });

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
    ["fromage râpé", "emmental"],
    ["poivre noir", "black-pepper"],
    ["riz basmati", "basmati-rice"],
    ["yaourt nature", "plain-yogurt"],
  ])("%s resolves to %s", async (name, slug) => {
    expect(await resolved(name)).toBe(slug);
  });

  test.each([
    ["chopped onions", "onion"],
    ["unsalted butter, softened", "butter-unsalted"],
    ["all-purpose flour, sifted", "flour-all-purpose"],
    ["fresh tomatoes", "tomato"],
    ["chicken breast", "chicken-breast"],
    ["dark chocolate", "dark-chocolate"],
  ])("%s resolves to %s in English", async (name, slug) => {
    expect(await resolved(name, "en")).toBe(slug);
  });

  /**
   * The other half of the threshold, and the more expensive half to get wrong: an ingredient the
   * catalog does not hold must produce nothing rather than its nearest-spelled row. A wrong link
   * corrupts the recipe's nutrition total and its grocery line, and reports no error anywhere.
   */
  test.each(["sumac", "harissa", "kombu", "quatre-quarts breton"])(
    "%s is unmatched rather than linked to its nearest row",
    async (name) => {
      expect(await resolved(name)).toBe("unmatched");
    },
  );

  /**
   * `Blanc de poulet` and `Blanc de poulet en tranches` reduce to the same two words once the
   * portion word is stripped, so both score 1 — raw chicken and deli slices, told apart by
   * whichever the search index returned first. `MARGIN` is what turns that coin flip into a tap.
   */
  test("a tie at the top asks rather than picking one", async () => {
    const [result] = await match(["blanc de poulet"]);

    expect(result!.status).toBe("ambiguous");

    const { candidates } = result as { candidates: { ingredientId: string; score: number }[] };
    expect(candidates.map(({ ingredientId }) => slugOf.get(ingredientId))).toEqual(
      expect.arrayContaining(["chicken-breast", "chicken-slices"]),
    );
    expect(candidates[0]!.score).toBeGreaterThanOrEqual(CONFIDENT);
  });

  test("an ambiguous line carries scores and no id to link", async () => {
    const [result] = await match(["blanc de poulet"]);

    expect(result).not.toHaveProperty("ingredientId");
    for (const candidate of (result as { candidates: { score: number }[] }).candidates)
      expect(candidate.score).toBeGreaterThan(0);
  });

  test("an empty catalog returns every name unmatched", async () => {
    const empty = convexTest(schema, modules);
    const results = await empty.run((ctx) =>
      matchIngredients(ctx, { names: ["pâtes", "oignon"], locale: "fr" }),
    );

    expect(results).toEqual([
      { status: "unmatched", name: "pâtes" },
      { status: "unmatched", name: "oignon" },
    ]);
  });
});
