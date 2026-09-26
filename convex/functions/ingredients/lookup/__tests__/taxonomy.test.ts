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
   * The collision the two-pass index exists to break, against the shipped file rather than a
   * fixture — the point is which entry the REAL taxonomy hands back.
   *
   * `searchTerms` strips `poudre` and `fondu`, so `oignon en poudre` (line 1609), the potato flour
   * synonym `pomme de terre en poudre` (line 319) and the butterfat synonym `beurre fondu` (line
   * 268) all fold onto the bare food's key — and every one of them sits ABOVE the food itself in
   * the file. Claimed by file order, `oignon` resolved to onion powder and answered a resolve with
   * its names and its CIQUAL figures.
   */
  test.each([
    ["oignon", "en:onion"],
    ["beurre", "en:butter"],
    ["pomme de terre", "en:potato"],
  ])("%s resolves to the food itself, not to the powder that folds onto its name", (typed, key) => {
    expect(findInTaxonomy(typed)?.key).toBe(key);
  });

  /**
   * The same collision one step wider: these five lost only STOPWORDS, not a qualifier, so the
   * predicate that fixed the three above could not see them. `Dés de jambon` drops `dés` and `de`
   * and claimed `jambon`; the lemon's key was held by a lemon LEAF. Counting every dropped word is
   * what hands each key back to the food itself.
   */
  test.each([
    ["jambon", "en:ham"],
    ["pomme", "en:apple"],
    ["apple", "en:apple"],
    ["vanille", "en:vanilla"],
    ["citron", "en:lemon"],
    ["chocolat", "en:chocolate"],
    ["chocolate", "en:chocolate"],
  ])("%s resolves to the food itself, not to a cut or a part of it", (typed, key) => {
    expect(findInTaxonomy(typed)?.key).toBe(key);
  });

  /**
   * A grade in the ENTRY's name is not a worse claim on the grade-free key, it is not a claim at
   * all. Eight `crème à N%` entries fold onto one key because `searchTerms` strips the grade, so
   * whichever won was the wrong fat content for the other seven — today it answered 33%. A miss
   * costs one generation and the resolver can still build `crème à 10%` correctly; a wrong fat
   * content is permanent and silent.
   */
  test("a graded spelling claims no key, so the general food falls through instead", () => {
    expect(findInTaxonomy("crème à 10% de matière grasse")).toBeUndefined();
    expect(findInTaxonomy("crème matière grasse")).toBeUndefined();
  });

  /**
   * The two lines this slice was reported for. Both are foods the taxonomy knows perfectly well,
   * and both were linked to a near-miss catalog row — `jus d'orange` and `oignon`.
   */
  test.each([
    ["jus de citron", "en:lemon-juice"],
    ["oignon vert", "en:spring-onion"],
  ])("%s is its own food and not the one it shares a word with", (typed, key) => {
    expect(findInTaxonomy(typed)?.key).toBe(key);
  });

  /**
   * ⚠️ This looks exactly like the crème case above and is its mirror image. `steak hache` has ONE
   * claimant and that spelling carries no grade — the 5% is in the shopper's QUERY, which
   * `gradesIn` pulls out and re-attaches when the catalog is re-searched. That is the designed
   * path, and it is what stops a 5% mince linking to the seeded `Bœuf haché (80/20)`.
   */
  test("a grade the shopper typed still finds the grade-free entry", () => {
    expect(findInTaxonomy("steak haché")?.key).toBe("en:meat-patty");
    expect(findInTaxonomy("steak haché 5%")?.key).toBe("en:meat-patty");
  });

  /**
   * A tea and a dye, pinned because they used to share a key. `thé` folded to the English stopword
   * `the`, so `thé vert` reduced to the bare `vert` — which is also what the E143 synonym
   * `Vert 1724` reduces to — and the tea held the key only by sitting earlier in the upstream file.
   *
   * The English stopwords are now tested before the accents come off (`STOPWORDS_EN` in
   * `@shared/ingredientMatch`), so the tea keys as `the vert` and the dye never competes for it.
   * The test stays because the failure it guards is silent: a shopper asking for green tea reaching
   * a colouring with no CIQUAL code at all.
   */
  test.each([
    ["thé vert", "en:green-tea", "18155"],
    ["thé noir", "en:black-tea", "18154"],
  ])("%s is the tea, and keeps the nutrition code the dye has none of", (typed, key, ciqual) => {
    expect(findInTaxonomy(typed)?.key).toBe(key);
    expect(findInTaxonomy(typed)?.ciqualCode).toBe(ciqual);
  });

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
