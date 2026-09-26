import { describe, expect, test } from "vitest";

import {
  CONFIDENT,
  foldCost,
  gradesIn,
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

  test("a qualifier the cook writes is stripped from the query", () => {
    expect(scoreCandidate("oignons finement émincés", candidate("onion", "Oignon"))).toBe(1);
    expect(scoreCandidate("fresh chopped tomatoes", TOMATO)).toBeGreaterThan(CONFIDENT);
  });

  /**
   * The other side of the line above. A qualifier the cook writes is something they will do; one a
   * catalog name carries is something the shop did, written there on purpose, and it is what makes
   * the row a different product. Stripped from both sides, the deli slices were `chicken` exactly
   * and outranked every raw cut for the bare word.
   */
  test("a qualifier in the catalog's name is part of what the row is", () => {
    const deli = candidate("sliced-cooked-chicken", "Sliced cooked chicken");

    expect(scoreCandidate("chicken", deli)).toBeLessThan(
      scoreCandidate("chicken", candidate("whole-chicken", "Whole chicken")),
    );
    expect(scoreCandidate("piment", candidate("chili-powder", "Piment en poudre"))).toBeLessThan(
      CONFIDENT,
    );
  });

  /**
   * The exception, and `preservationIn` draws the same one: fresh is the state a food is sold in
   * unless something says otherwise, so a row calling itself fresh has named no different product.
   * Without it "ginger" tied fresh with ground, and "tagliatelle" cost a model call to reach the
   * only tagliatelle the catalog holds.
   */
  test("fresh in the catalog's name is the default state, not a different product", () => {
    expect(scoreCandidate("ginger", candidate("x", "Fresh ginger"))).toBe(1);
    expect(scoreCandidate("coriandre", candidate("x", "Coriandre fraîche"))).toBe(1);
    expect(scoreCandidate("tagliatelle", candidate("x", "Tagliatelles fraîches"))).toBe(1);
  });

  /**
   * `frais` ends in an s, so the singularizer made it `frai` before the qualifier list was
   * consulted, and the list — written `frais` — never matched it. The masculine was the one form
   * of fresh the rule above did not reach.
   */
  test("frais is fresh too, although it ends in an s", () => {
    expect(scoreCandidate("origan", candidate("x", "Origan frais"))).toBe(1);
    expect(scoreCandidate("gingembre", candidate("x", "Gingembre frais"))).toBe(1);
  });

  test("a query naming the row's own qualifiers still matches it exactly", () => {
    expect(scoreCandidate("sliced cooked chicken", candidate("x", "Sliced cooked chicken"))).toBe(1);
    expect(scoreCandidate("2 cuillères de piment en poudre", candidate("x", "Piment en poudre"))).toBe(1);
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

  test("a word beside thé is not the tea's whole name", () => {
    const tea = candidate("black-tea", "Thé noir");

    expect(scoreCandidate("thé noir", tea)).toBe(1);
    expect(scoreCandidate("noir", tea)).toBeLessThan(CONFIDENT);
  });

  test("ground cloves are the spice, not ground beef", () => {
    const cloves = candidate("cloves", "Cloves");

    expect(scoreCandidate("ground cloves", cloves)).toBeGreaterThan(
      scoreCandidate("ground cloves", candidate("ground-beef", "Ground beef")),
    );
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

  /**
   * The French word folds onto the English stopword, and folding first made it one. "thé" alone
   * survived only on the all-stopwords fallback; beside another word it vanished, so "thé noir"
   * searched for `noir` and reached black pepper and dark chocolate as readily as the tea.
   */
  test("keeps thé, which only its fold makes an English stopword", () => {
    expect(searchTerms("thé")).toBe("the");
    expect(searchTerms("thé noir")).toBe("the noir");
    expect(searchTerms("the black tea")).toBe("black tea");
  });

  test("drops a listed qualifier ending in s, which the singularizer used to hide", () => {
    expect(searchTerms("gros sel")).toBe("sel");
    expect(searchTerms("origan frais")).toBe("origan");
  });

  test("still drops a French packaging word typed with its accent", () => {
    expect(searchTerms("1 boîte de thon")).toBe("thon");
    expect(searchTerms("2 cuillères de sucre")).toBe("sucre");
  });

  /**
   * The other side of the split. `à` and `pièce` were only ever stripped by folding into the
   * English `a` and `piece`; tested as typed, they stopped matching, and "sauce à la tomate" fell
   * below the bar against `Sauce tomate`. They are French words, so the French list holds them.
   */
  test("drops à and pièce, which only folding used to make English stopwords", () => {
    expect(searchTerms("sauce à la tomate")).toBe("sauce tomate");
    expect(searchTerms("1 pièce de bœuf")).toBe("boeuf");
  });

  /**
   * "clove" is the one packaging word that is also a food. As a stopword it reduced "ground cloves"
   * to `ground`, which is ground beef's word — and the spice was never retrieved at all. The garlic
   * phrasings it used to serve are catalog aliases on garlic instead.
   */
  test("keeps clove, which is a spice as well as a measure of garlic", () => {
    expect(searchTerms("ground cloves")).toBe("ground clove");
    expect(searchTerms("2 garlic cloves")).toBe("garlic clove");
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
 * What the taxonomy index ranks its claimants by: how many words folding threw away. `oignon en
 * poudre` and `Dés de jambon` both fold onto a bare food's key, and this number is what stops
 * either of them owning it.
 */
describe("foldCost", () => {
  test("0 for a name that keeps every word it identifies with", () => {
    expect(foldCost("oignon")).toBe(0);
    expect(foldCost("carotte")).toBe(0);
    expect(foldCost("oignon vert")).toBe(0);
  });

  /**
   * The gap this replaced `hasQualifier` to close. `dés` and `de` are both stopwords, so the old
   * predicate called this name unreduced and let it claim `jambon` on file order alone.
   */
  test("counts stopwords, which the qualifier-only predicate did not", () => {
    expect(foldCost("Dés de jambon")).toBe(2);
    expect(foldCost("jus de citron")).toBe(1);
  });

  /**
   * A dropped number counts too, and the additives are why. OFF files colours as `Vert 1724`, which
   * folds to the bare `vert` — the key of any food whose other word folding strips. Leave the number
   * free and the dye costs 0 there, and claims that key from every food with a better right to it.
   */
  test("counts a dropped number, so a code is not a free claim on the word beside it", () => {
    expect(foldCost("Vert 1724")).toBe(1);
    expect(foldCost("2 gousses d'ail")).toBe(3);
    expect(foldCost("200g de pâtes")).toBe(2);
  });

  test("counts qualifiers, and counts both kinds together", () => {
    expect(foldCost("beurre fondu")).toBe(1);
    expect(foldCost("oignon en poudre")).toBe(2);
    expect(foldCost("pomme de terre en poudre")).toBe(3);
  });

  /**
   * The reason the rule counts rather than answering yes or no. `pomme de terre` is reduced too —
   * it loses `de` — so a "did folding drop anything?" predicate disqualifies the potato from its
   * own name. It wins on being reduced LESS, and only a number can say that.
   */
  test("ranks a food's own name above the spellings that fold onto it", () => {
    expect(foldCost("jambon")).toBeLessThan(foldCost("Dés de jambon"));
    expect(foldCost("pomme de terre")).toBeLessThan(foldCost("pomme de terre en poudre"));
    // Each pair folds to one key, which is the collision the ordering exists to break.
    expect(searchTerms("Dés de jambon")).toBe(searchTerms("jambon"));
    expect(searchTerms("pomme de terre en poudre")).toBe(searchTerms("pomme de terre"));
  });

  /**
   * `_tokenize` falls back to the qualifiers themselves rather than to nothing, so a name made only
   * of them dropped nothing — and a food genuinely called "poudre" keeps its own key.
   */
  test("a name that is only qualifiers still folds to itself, at no cost", () => {
    expect(foldCost("poudre")).toBe(0);
    expect(foldCost("fondu")).toBe(0);
    expect(foldCost("")).toBe(0);
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
