import { describe, expect, test } from "vitest";

import { compositionOf } from "../composition";
import { findInTaxonomy, spellingsOf } from "../taxonomy";

/**
 * The wrong-language fix, tested against the dataset this repo actually ships rather than a
 * fixture — a fixture would prove the lookup works and say nothing about whether the pruned file
 * still contains the foods a shopper types. If `build-ingredient-data.mjs` ever prunes too hard,
 * this is what fails.
 */
describe("functions/ingredients/lookup/taxonomy", () => {
  test("an English word reaches the entry whose French name the catalog holds", () => {
    const entry = findInTaxonomy("carrot");

    expect(entry?.names.fr).toBe("carotte");
    expect(entry?.names.en).toBe("carrot");
  });

  test("and the same entry from the French side — the bridge goes both ways", () => {
    expect(findInTaxonomy("carotte")?.key).toBe(findInTaxonomy("carrot")?.key);
  });

  /**
   * The synonym lists are the half of the dataset that the canonical names cannot cover: OFF's
   * English name for `en:aubergine` is "aubergine", so an American shopper typing "eggplant"
   * reaches it only through a synonym. Same shape for "zucchini" against `en:courgette`.
   */
  test.each([
    ["eggplant", "aubergine"],
    ["zucchini", "courgette"],
  ])("the synonym %s reaches the food the catalog spells %s", (typed, french) => {
    expect(findInTaxonomy(typed)?.names.fr).toBe(french);
  });

  /**
   * The folding `searchTerms` does is what makes this a dictionary a shopper can hit: they type a
   * quantity, an accent and a preparation qualifier, and the taxonomy is spelled with none of them.
   */
  test.each(["Carotte", "carottes", "2 carottes râpées", "  carotte  "])(
    "%s folds to the same entry as the bare name",
    (typed) => {
      expect(findInTaxonomy(typed)?.key).toBe("en:carrot");
    },
  );

  /**
   * Exact on the folded form, and NOT fuzzy — the reason is in the doc on `findInTaxonomy`. Six
   * thousand foods including every additive OFF knows is a corpus where a near-miss is a
   * confident-looking wrong answer with a nutrition table attached.
   */
  test("a misspelling is a miss, not a near match", () => {
    expect(findInTaxonomy("carott")).toBeUndefined();
    expect(findInTaxonomy("carrotte")).toBeUndefined();
  });

  test("nothing at all is a miss rather than a throw", () => {
    expect(findInTaxonomy("")).toBeUndefined();
    expect(findInTaxonomy("   ")).toBeUndefined();
    expect(findInTaxonomy("zzzqqq")).toBeUndefined();
  });

  test("spellings are what the catalog gets re-searched with, in both locales", () => {
    const spellings = spellingsOf(findInTaxonomy("carrot")!);

    expect(spellings).toContain("carrot");
    expect(spellings).toContain("carotte");
  });
});

describe("functions/ingredients/lookup/composition", () => {
  test("CIQUAL answers a food the taxonomy carries a code for", () => {
    const nutrition = compositionOf(findInTaxonomy("carrot")!);

    // Raw carrot, per 100g. Loose bounds: this asserts the join and the units, not CIQUAL's
    // arithmetic — a tight number here would fail on a dataset refresh that changed nothing.
    expect(nutrition?.calories).toBeGreaterThan(20);
    expect(nutrition?.calories).toBeLessThan(60);
    expect(nutrition?.fiber).toBeGreaterThan(0);
  });

  test("every one of the eight fields is present, or the food is absent entirely", () => {
    const nutrition = compositionOf(findInTaxonomy("carrot")!);

    expect(Object.values(nutrition!).every((value) => typeof value === "number")).toBe(true);
  });

  /**
   * Roughly one food in seven that the taxonomy can name is one CIQUAL measured. A caller must
   * handle the miss — it is the common case, not the edge one.
   */
  test("a food CIQUAL never measured returns nothing rather than zeroes", () => {
    const uncovered = findInTaxonomy("carrot")!;

    expect(compositionOf({ ...uncovered, ciqualCode: undefined })).toBeUndefined();
    expect(compositionOf({ ...uncovered, ciqualCode: "000000" })).toBeUndefined();
  });
});
