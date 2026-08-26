import { describe, expect, test } from "vitest";

import {
  CONFIDENT,
  PLAUSIBLE,
  type Candidate,
  rankCandidates,
  scoreCandidate,
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
