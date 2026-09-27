import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Id } from "@convex/_generated/dataModel";
import type { Allergen } from "@shared/allergens";
import type { Category } from "@shared/categories";
import type { Diet } from "@shared/diets";

import schema from "../../../schema";
import { computeTags, type TaggableLine } from "../computeTags";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

/**
 * One catalog row, with the facts the tags are decided from.
 *
 * `diet` and `allergens` default to the CLASSIFIED, permissive answer - a vegan ingredient
 * carrying nothing - so a test that cares about one of them sets that one and nothing else. Both
 * take `null` to mean UNCLASSIFIED, which is a different fixture from "classified as carrying
 * nothing" and is the one the refusal tests need. `undefined` cannot say that: it is what the
 * default fills in.
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
  {
    diet = "vegan",
    allergens = [],
    edibleShare,
  }: { diet?: Diet | null; allergens?: Allergen[] | null; edibleShare?: number } = {},
) =>
  t.run((ctx) =>
    ctx.db.insert("ingredients", {
      name: { values: { fr: "x", en: "x" }, meta: {} },
      search: { fr: "x", en: "x" },
      category,
      emoji: "🥕",
      ...(diet !== null && { diet }),
      ...(allergens !== null && { allergens }),
      defaultUnit: "pcs",
      defaultQuantity: 1,
      ...(gramsPerPiece !== null && { gramsPerPiece }),
      ...(edibleShare !== undefined && { edibleShare }),
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

  describe("diet tags, from the ingredient rows", () => {
    test("calls an all-plant recipe suitable for all three diets", async () => {
      const vegetable = await catalog("VEGETABLE", BLAND);

      expect(await compute([line(vegetable)])).toEqual(
        expect.arrayContaining(["pescatarian", "vegetarian", "vegan"]),
      );
    });

    test("withholds vegan once a vegetarian line is in the list", async () => {
      const vegetable = await catalog("VEGETABLE", BLAND);
      const cheese = await catalog("DAIRY", BLAND, 100, { diet: "vegetarian" });

      const tags = await compute([line(vegetable), line(cheese)]);

      expect(tags).toContain("vegetarian");
      expect(tags).not.toContain("vegan");
    });

    test("withholds vegetarian once a pescatarian line is in the list", async () => {
      const vegetable = await catalog("VEGETABLE", BLAND);
      const fish = await catalog("SEAFOOD", BLAND, 100, { diet: "pescatarian" });

      const tags = await compute([line(vegetable), line(fish)]);

      expect(tags).toContain("pescatarian");
      expect(tags).not.toContain("vegetarian");
    });

    test("claims no diet at all once an omnivore line is in the list", async () => {
      const beef = await catalog("MEAT", BLAND, 100, { diet: "omnivore" });

      const tags = await compute([line(beef)]);

      expect(tags).not.toContain("pescatarian");
      expect(tags).not.toContain("vegetarian");
      expect(tags).not.toContain("vegan");
    });

    /**
     * The bug this field exists to fix. Honey is a `SWEETENER`, fish sauce a `CONDIMENT` and
     * gelatin an `OTHER` - a version reading `category` calls every one of them a plant, and a pad
     * thai comes out vegetarian. The row's own `diet` is what settles it, and the category on each
     * fixture here is deliberately the one that would have given the wrong answer.
     */
    test.each<[string, Category, Diet, string[]]>([
      ["honey", "SWEETENER", "vegetarian", ["vegan"]],
      ["fish sauce", "CONDIMENT", "pescatarian", ["vegan", "vegetarian"]],
      ["gelatin", "OTHER", "omnivore", ["vegan", "vegetarian", "pescatarian"]],
    ])("does not read %s as a plant because of its category", async (_, category, diet, denied) => {
      const vegetable = await catalog("VEGETABLE", BLAND);
      const suspect = await catalog(category, BLAND, 100, { diet });

      const tags = await compute([line(vegetable), line(suspect)]);

      for (const tag of denied) expect(tags).not.toContain(tag);
    });

    /** Unclassified is not permissive: one unknown line costs the whole recipe its diet tags. */
    test("claims no diet when a row has never been classified", async () => {
      const known = await catalog("VEGETABLE", BLAND);
      const unknown = await catalog("VEGETABLE", BLAND, 100, { diet: null });

      const tags = await compute([line(known), line(unknown)]);

      expect(tags).not.toContain("pescatarian");
      expect(tags).not.toContain("vegetarian");
      expect(tags).not.toContain("vegan");
      // The other groups do not depend on the diet, and degrade separately.
      expect(tags).toContain("nut-free");
    });
  });

  describe("free-from tags, from the ingredient allergens", () => {
    test("awards all three to a recipe of rows classified as carrying nothing", async () => {
      const clean = await catalog("VEGETABLE", BLAND);

      expect(await compute([line(clean)])).toEqual(
        expect.arrayContaining(["gluten-free", "dairy-free", "nut-free"]),
      );
    });

    test.each<[Allergen, string]>([
      ["gluten", "gluten-free"],
      ["milk", "dairy-free"],
      ["nuts", "nut-free"],
      ["peanuts", "nut-free"],
    ])("withholds the tag %s speaks to, and no other", async (allergen, denied) => {
      const clean = await catalog("VEGETABLE", BLAND);
      const carrier = await catalog("OTHER", BLAND, 100, { allergens: [allergen] });

      const tags = await compute([line(clean), line(carrier)]);

      expect(tags).not.toContain(denied);
      for (const other of ["gluten-free", "dairy-free", "nut-free"].filter((t) => t !== denied)) {
        expect(tags).toContain(other);
      }
    });

    /** Ten of the fourteen have no tag reading them, and must not quietly suppress one. */
    test("awards all three despite an allergen no tag is about", async () => {
      const celery = await catalog("VEGETABLE", BLAND, 100, { allergens: ["celery", "sulphites"] });

      expect(await compute([line(celery)])).toEqual(
        expect.arrayContaining(["gluten-free", "dairy-free", "nut-free"]),
      );
    });

    /**
     * The distinction the field exists for: `[]` is "checked, carries none" and `undefined` is
     * "nobody checked". Reading the second as the first is a confident `nut-free` on a recipe
     * containing an ingredient nothing has ever classified.
     */
    test("claims nothing free-from when a row has never been classified", async () => {
      const checked = await catalog("VEGETABLE", BLAND);
      const unchecked = await catalog("OTHER", BLAND, 100, { allergens: null });

      const tags = await compute([line(checked), line(unchecked)]);

      expect(tags).not.toContain("gluten-free");
      expect(tags).not.toContain("dairy-free");
      expect(tags).not.toContain("nut-free");
      // The diet answer does not depend on the allergens, and survives.
      expect(tags).toContain("vegan");
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
     * The shells are bought, not eaten. A tag read off the as-bought weight would deny a dish of
     * mussels a claim the plate earns, so the tags count the same eaten grams the figures do.
     */
    test("decides the tags on the share of each line that is eaten", async () => {
      const rich = { calories: 700, protein: 5, fat: 20, carbohydrates: 100 };
      const whole = await catalog("GRAIN", rich);
      const halfEaten = await catalog("GRAIN", rich, 100, { edibleShare: 0.5 });

      expect(await compute([line(whole)])).not.toContain("low-calorie");
      expect(await compute([line(halfEaten)])).toContain("low-calorie");
    });

    /**
     * A line that cannot reach grams has no nutrition, and `totalsOf` refuses a partial total. The
     * diet answer does not depend on weight, so it survives — the two degrade separately.
     */
    test("keeps the diet tags but drops the nutrition ones when a line cannot be weighed", async () => {
      const unweighable = await catalog("VEGETABLE", BLAND, null);

      const tags = await compute([line(unweighable)]);

      expect(tags).toContain("vegan");
      expect(tags).toContain("nut-free");
      expect(tags).not.toContain("low-calorie");
      expect(tags).not.toContain("high-protein");
    });
  });
});
