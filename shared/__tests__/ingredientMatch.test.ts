import { describe, expect, test } from "vitest";

import {
  CONFIDENT,
  gradesIn,
  hasQualifier,
  PLAUSIBLE,
  preservationIn,
  RESOLVABLE,
  type Candidate,
  rankCandidates,
  scoreCandidate,
  searchTerms,
} from "../ingredientMatch";

const candidate = (id: string, name: string, aliases?: string[]): Candidate => ({
  id,
  name,
  aliases,
});

/** The rows this file argues about, spelled as `toCatalogIngredient` hands them out in French. */
const PASTA = candidate("pasta-dry", "Pâtes", ["pâtes sèches"]);
const POTATO = candidate("potato", "Pommes de terre", ["patates"]);
const CHIPS = candidate("chips", "Chips de patates");
const TOMATO = candidate("tomato", "Tomate");

/** The two graded rows this file's hardest case is about. `Bœuf haché (80/20)` is seeded. */
const MINCE_20 = candidate("ground-beef-80-20", "Bœuf haché (80/20)", ["steak haché"]);
const MINCE_5 = candidate("ground-beef-95-5", "Steak haché 5%");

describe("scoreCandidate", () => {
  test("an exact name is 1, whatever the accents and the plural", () => {
    expect(scoreCandidate("pâtes", PASTA)).toBe(1);
    expect(scoreCandidate("pates", PASTA)).toBe(1);
    expect(scoreCandidate("Pâte", PASTA)).toBe(1);
  });

  test("an exact name beats an exact alias", () => {
    const byName = scoreCandidate("patates", candidate("x", "Patates"));

    expect(byName).toBeGreaterThan(scoreCandidate("patates", POTATO));
    expect(scoreCandidate("patates", POTATO)).toBeGreaterThan(CONFIDENT);
  });

  /**
   * The ceiling, stated as a behaviour: a synonym somebody wrote down outranks a spelling this
   * file merely found similar, however similar it is.
   */
  test("an exact alias beats a partial match", () => {
    expect(scoreCandidate("patates", POTATO)).toBeGreaterThan(scoreCandidate("patates", CHIPS));
  });

  /**
   * The case the whole penalty term exists for. `searchCatalog` returns `chips de patates` first
   * when the catalog holds nothing better, and it contains the word the cook typed — so coverage
   * alone ranks it top. It carries a word the cook never mentioned, and that is what sinks it.
   */
  test("a candidate carrying words the query never mentioned falls under CONFIDENT", () => {
    expect(scoreCandidate("patates", CHIPS)).toBeLessThan(CONFIDENT);
  });

  test("preparation qualifiers are stripped from both sides", () => {
    expect(scoreCandidate("oignons finement émincés", candidate("onion", "Oignon"))).toBe(1);
    expect(scoreCandidate("fresh chopped tomatoes", TOMATO)).toBeGreaterThan(CONFIDENT);
  });

  test("a name made only of qualifiers still identifies itself", () => {
    expect(scoreCandidate("frais", candidate("fresh", "Frais"))).toBe(1);
  });

  /**
   * The grade block. Every case here scored **1.0** before `_grades` existed — an exact match,
   * linked without the ranker being asked — because "%" folded to a space and the digits behind it
   * were read as a quantity. Two mince rows differ by nothing else, so nothing else could catch it.
   */
  test("two grades of the same food are not the same food", () => {
    expect(scoreCandidate("steak haché 5%", MINCE_5)).toBe(1);
    expect(scoreCandidate("steak haché 5%", candidate("x", "Steak haché 20%"))).toBeLessThan(
      CONFIDENT,
    );
    expect(scoreCandidate("chocolat noir 70%", candidate("x", "Chocolat noir 85%"))).toBeLessThan(
      CONFIDENT,
    );
  });

  test("a graded food is not its ungraded row either", () => {
    expect(scoreCandidate("steak haché 5%", candidate("x", "Steak haché"))).toBeLessThan(CONFIDENT);
  });

  test("a decimal grade does not collide with the whole number that spells it", () => {
    expect(scoreCandidate("lait 1,5%", candidate("x", "Lait 15%"))).toBeLessThan(CONFIDENT);
  });

  test("a wrong grade is still a candidate worth asking a reader about", () => {
    expect(scoreCandidate("steak haché 5%", candidate("x", "Steak haché 20%"))).toBeGreaterThan(
      RESOLVABLE,
    );
  });

  /**
   * The two notations a kitchen writes with one character. A butcher's ratio is improper and is a
   * grade; a recipe's fraction is proper and is a quantity, which is why "1/2 citron" is a lemon.
   */
  test("an improper fraction is a grade, a proper one is a quantity", () => {
    expect(scoreCandidate("boeuf haché 95/5", MINCE_20)).toBeLessThan(CONFIDENT);
    expect(scoreCandidate("1/2 citron", candidate("lemon", "Citron"))).toBe(1);
  });

  /**
   * `haché` left `QUALIFIERS`, and this is the pair that sent it there: stripping it made minced
   * beef and a steak one string. The alias hit below is the control — the fixture in
   * `searchWidened.test.ts` depends on it, and removing the word must not cost it.
   */
  test("mincing a cow makes a different product; mincing an onion does not", () => {
    expect(scoreCandidate("steak haché", candidate("x", "Steak"))).toBeLessThan(CONFIDENT);
    expect(scoreCandidate("viande hachée", candidate("x", "Viande hachée"))).toBe(1);
    expect(scoreCandidate("3 oignons, émincés", candidate("onion", "Oignon"))).toBe(1);
  });

  test("an unrelated ingredient scores below PLAUSIBLE", () => {
    expect(scoreCandidate("saumon", PASTA)).toBeLessThan(PLAUSIBLE);
    expect(scoreCandidate("beurre", TOMATO)).toBeLessThan(PLAUSIBLE);
  });

  test("an empty query scores nothing rather than matching everything", () => {
    expect(scoreCandidate("   ", PASTA)).toBe(0);
  });

  test("every score stays inside 0..1", () => {
    for (const query of ["pâtes", "patates", "chips", "saumon fumé", "2 oignons", ""]) {
      for (const row of [PASTA, POTATO, CHIPS, TOMATO]) {
        const score = scoreCandidate(query, row);

        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("rankCandidates", () => {
  test("orders by score, best first", () => {
    const ranked = rankCandidates("patates", [CHIPS, PASTA, POTATO]);

    // Pasta is present, and belongs there: "pâtes" is one syllable off "patates", which is a row
    // worth offering a cook and never one to link silently. Only the potato clears CONFIDENT.
    expect(ranked.map(({ id }) => id)).toEqual(["potato", "chips", "pasta-dry"]);
    expect(ranked.filter(({ score }) => score >= CONFIDENT).map(({ id }) => id)).toEqual([
      "potato",
    ]);
  });

  test("drops rows sharing nothing with the query rather than returning them at 0", () => {
    expect(rankCandidates("saumon", [PASTA, TOMATO]).map(({ score }) => score)).not.toContain(0);
  });

  test("keeps the search index's own order between equal scores", () => {
    const first = candidate("first", "Tomate");
    const second = candidate("second", "Tomate");

    expect(rankCandidates("tomate", [first, second]).map(({ id }) => id)).toEqual([
      "first",
      "second",
    ]);
  });
});

describe("searchTerms", () => {
  test("drops the grade, which no index ever stored", () => {
    expect(searchTerms("steak haché 5%")).toBe("steak hache");
    expect(searchTerms("boeuf haché 95/5")).toBe("boeuf hache");
  });

  test("still drops quantities and qualifiers", () => {
    expect(searchTerms("200g de pâtes")).toBe("pate");
    expect(searchTerms("3 oignons, émincés")).toBe("oignon");
  });
});

/**
 * The inverse of `searchTerms`' grade filter. It exists because a grade can survive a translation:
 * the resolver looks an unknown word up in a taxonomy filed under grade-free spellings, so the
 * shopper's "5%" is dropped on the way in and has to be re-attached on the way out.
 */
describe("gradesIn", () => {
  test("returns the grade tokens searchTerms throws away", () => {
    expect(gradesIn("steak haché 5%")).toEqual(["pct5"]);
    expect(searchTerms("steak haché 5%")).toBe("steak hache");
  });

  test("reads an improper ratio as a grade and a proper fraction as not one", () => {
    expect(gradesIn("boeuf haché 80/20")).toEqual(["pct80"]);
    expect(gradesIn("1/2 citron")).toEqual([]);
  });

  test("keeps a decimal grade distinct from the whole number it folds near", () => {
    expect(gradesIn("lait 1,5%")).toEqual(["pct1d5"]);
    expect(gradesIn("crème 15%")).toEqual(["pct15"]);
  });

  test("is empty for a name carrying no grade", () => {
    expect(gradesIn("carotte")).toEqual([]);
    expect(gradesIn("200g de pâtes")).toEqual([]);
  });

  /**
   * Re-attaching a token has to survive folding, or the round trip it exists for does not work:
   * the grade must stay invisible to retrieval and decisive in ranking, exactly as if the shopper
   * had typed it against the row directly.
   */
  test("produces tokens that fold back to themselves", () => {
    const regraded = `steak haché ${gradesIn("steak haché 5%").join(" ")}`;

    expect(searchTerms(regraded)).toBe("steak hache");
    expect(scoreCandidate(regraded, candidate("mince", "Bœuf haché (80/20)", ["steak haché"])))
      .toBeLessThan(CONFIDENT);
  });
});

/**
 * The question the taxonomy index asks before it lets a spelling claim a key: did folding this name
 * throw a word away? `oignon en poudre` folds onto `oignon`, and the answer here is what stops
 * onion powder owning the onion's name.
 */
describe("hasQualifier", () => {
  test("true when folding drops a qualifier and leaves a different food's name behind", () => {
    expect(hasQualifier("oignon en poudre")).toBe(true);
    expect(hasQualifier("beurre fondu")).toBe(true);
    expect(hasQualifier("pomme de terre en poudre")).toBe(true);
    // Each of them folds onto the bare food, which is the collision this exists to break.
    expect(searchTerms("oignon en poudre")).toBe(searchTerms("oignon"));
    expect(searchTerms("beurre fondu")).toBe(searchTerms("beurre"));
  });

  test("false for a name that keeps every word it identifies with", () => {
    expect(hasQualifier("oignon")).toBe(false);
    expect(hasQualifier("jus de citron")).toBe(false);
    expect(hasQualifier("oignon vert")).toBe(false);
    expect(hasQualifier("carotte")).toBe(false);
  });

  /**
   * A stopword is not a qualifier: "de" carries no identity and dropping it takes nothing with it,
   * so a name reduced only by stopwords is still its own name.
   */
  test("false when only stopwords and quantities came off", () => {
    expect(hasQualifier("200g de pâtes")).toBe(false);
    expect(hasQualifier("2 gousses d'ail")).toBe(false);
  });

  /**
   * `_tokenize` falls back to the qualifiers themselves rather than to nothing, so a name made only
   * of them dropped nothing — and a food genuinely called "poudre" keeps its own key.
   */
  test("false when the name is nothing but qualifiers", () => {
    expect(hasQualifier("poudre")).toBe(false);
    expect(hasQualifier("fondu")).toBe(false);
    expect(hasQualifier("")).toBe(false);
  });
});

describe("preservationIn", () => {
  /**
   * The line is who performed the verb. Drying is the shop's doing and makes a different product;
   * cooking and mincing are the cook's and do not.
   */
  test("returns the preservation words QUALIFIERS strips, in both languages", () => {
    expect(preservationIn("tomates séchées")).toEqual(["sechee"]);
    expect(preservationIn("tomates séchés")).toEqual(["seche"]);
    expect(preservationIn("dried tomatoes")).toEqual(["dried"]);
    // Stripped by `searchTerms`, which is exactly why they have to be read back here.
    expect(searchTerms("tomates séchées")).toBe("tomate");
    expect(searchTerms("dried tomatoes")).toBe("tomato");
  });

  /**
   * Frozen peas are peas and tinned tomatoes are tomatoes — same shelf-life question, same cooking,
   * same numbers. Only drying concentrates a food into a different ingredient.
   */
  test("is empty for a preparation that does not change what is bought", () => {
    expect(preservationIn("petits pois surgelés")).toEqual([]);
    expect(preservationIn("tomates en conserve")).toEqual([]);
    expect(preservationIn("cooked beef")).toEqual([]);
    expect(preservationIn("oignon émincé")).toEqual([]);
  });

  /** `fresh` is the default state: listing it would split `fresh tomatoes` from `tomatoes`. */
  test("is empty for fresh, so the default state never splits a name", () => {
    expect(preservationIn("fresh tomatoes")).toEqual([]);
    expect(preservationIn("coriandre fraîche")).toEqual([]);
  });

  test("is empty for a name carrying no preservation word", () => {
    expect(preservationIn("carotte")).toEqual([]);
    expect(preservationIn("200g de pâtes")).toEqual([]);
  });
});
