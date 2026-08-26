import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Id } from "@convex/_generated/dataModel";
import type { Category } from "@convex/schema/ingredients";

import schema from "../../../schema";
import { computeTags, type TaggableLine } from "../computeTags";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

/**
 * One catalog row, with the two things the tags are decided from: a category and per-100g macros.
 *
 * `gramsPerPiece` is always set, so every fixture line can be weighed in `pcs` and the "could not
 * be weighed" path is something a test opts INTO rather than trips over.
 */
const catalog = (
  category: Category,
  nutrition: { calories: number; protein: number; fat: number; carbohydrates: number },
  // `null` and not `undefined`: an explicit `undefined` would take the default and silently give
  // the row a weight, which is the one thing the "cannot be weighed" test needs it not to have.
  gramsPerPiece: number | null = 100,
) =>
  t.run((ctx) =>
    ctx.db.insert("ingredients", {
      name: { values: { fr: "x", en: "x" }, meta: {} },
      search: { fr: "x", en: "x" },
      category,
      defaultUnit: "pcs",
      defaultQuantity: 1,
      ...(gramsPerPiece !== null && { gramsPerPiece }),
      nutrition,
      updatedAt: Date.now(),
    }),
  );

const BLAND = { calories: 10, protein: 1, fat: 1, carbohydrates: 1 };

const line = (ingredientId: Id<"ingredients">, quantity = 1): TaggableLine => ({
  ingredientId,
  quantity,
  unit: "pcs",
});

const compute = (lines: TaggableLine[], lineCount = lines.length, servings = 1) =>
  t.run((ctx) => computeTags(ctx, { lines, lineCount, servings }));

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("functions/recipes/computeTags", () => {
  describe("what it refuses to answer", () => {
    /**
     * The reason this function takes `lineCount` at all. `saveRecipe` drops unmatched lines, so
     * computing over what survived would call a recipe vegan on the strength of the ingredients it
     * happened to recognise — and the one it did not could be the beef.
     */
    test("returns nothing when a line did not resolve to a catalog row", async () => {
      const vegetable = await catalog("VEGETABLE", BLAND);

      expect(await compute([line(vegetable)], 2)).toEqual([]);
    });

    test("returns nothing for a recipe with no lines at all", async () => {
      expect(await compute([], 0)).toEqual([]);
    });

    /** A row deleted between the match and the read is an unknown ingredient, not a vegetable. */
    test("returns nothing when a matched row has since been deleted", async () => {
      const vegetable = await catalog("VEGETABLE", BLAND);
      await t.run((ctx) => ctx.db.delete(vegetable));

      expect(await compute([line(vegetable)])).toEqual([]);
    });
  });

  describe("diet tags, from the ingredient categories", () => {
    test("calls an all-vegetable recipe suitable for all three diets", async () => {
      const vegetable = await catalog("VEGETABLE", BLAND);

      expect(await compute([line(vegetable)])).toEqual(
        expect.arrayContaining(["pescatarian", "vegetarian", "vegan"]),
      );
    });

    test("withholds vegan once dairy is in the list", async () => {
      const vegetable = await catalog("VEGETABLE", BLAND);
      const cheese = await catalog("DAIRY", BLAND);

      const tags = await compute([line(vegetable), line(cheese)]);

      expect(tags).toContain("vegetarian");
      expect(tags).not.toContain("vegan");
    });

    test("withholds vegetarian once seafood is in the list", async () => {
      const vegetable = await catalog("VEGETABLE", BLAND);
      const fish = await catalog("SEAFOOD", BLAND);

      const tags = await compute([line(vegetable), line(fish)]);

      expect(tags).toContain("pescatarian");
      expect(tags).not.toContain("vegetarian");
    });

    test("claims no diet at all once meat is in the list", async () => {
      const beef = await catalog("MEAT", BLAND);

      const tags = await compute([line(beef)]);

      expect(tags).not.toContain("pescatarian");
      expect(tags).not.toContain("vegetarian");
      expect(tags).not.toContain("vegan");
    });
  });

  describe("nutrition tags, from the weighed totals", () => {
    /** 100g at 30g protein / 120 kcal — protein is 100% of the energy, and the portion is small. */
    test("awards the nutrition tags a serving's macros earn", async () => {
      const lean = await catalog("LEGUME", {
        calories: 120,
        protein: 30,
        fat: 0,
        carbohydrates: 0,
      });

      const tags = await compute([line(lean)]);

      expect(tags).toContain("high-protein");
      expect(tags).toContain("low-carb");
      expect(tags).toContain("low-calorie");
    });

    /** Two servings of the same pot is half the calories each — the tag follows the portion. */
    test("divides by the servings the recipe is written for", async () => {
      const rich = await catalog("GRAIN", {
        calories: 700,
        protein: 5,
        fat: 20,
        carbohydrates: 100,
      });

      expect(await compute([line(rich)], 1, 1)).not.toContain("low-calorie");
      expect(await compute([line(rich)], 1, 2)).toContain("low-calorie");
    });

    /**
     * A line that cannot reach grams has no nutrition, and `totalsOf` refuses a partial total. The
     * diet answer does not depend on weight, so it survives — the two degrade separately.
     */
    test("keeps the diet tags but drops the nutrition ones when a line cannot be weighed", async () => {
      const unweighable = await catalog("VEGETABLE", BLAND, null);

      const tags = await compute([line(unweighable)]);

      expect(tags).toContain("vegan");
      expect(tags).not.toContain("low-calorie");
      expect(tags).not.toContain("high-protein");
    });
  });
});
