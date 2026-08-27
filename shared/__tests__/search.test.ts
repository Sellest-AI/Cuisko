import { describe, expect, test } from "vitest";

import { searchTextOf } from "../search";

describe("searchTextOf", () => {
  test("keeps every term it was given", () => {
    expect(searchTextOf(["onion", "shallot"])).toContain("onion");
    expect(searchTextOf(["onion", "shallot"])).toContain("shallot");
  });

  /**
   * The property the whole supermarket case rests on: BOTH spellings are indexed. Folding in place
   * would make the correctly-typed query the one that fails.
   */
  test("adds an accent-folded copy without dropping the accented one", () => {
    const text = searchTextOf(["crème"]);

    expect(text.split(" ")).toEqual(["crème", "creme"]);
  });

  /**
   * `œ` has no Unicode decomposition, so `NFD` alone leaves "bœuf" whole and the only spelling a
   * phone keyboard offers reaches nothing. The expansion is the fold's, not this function's — the
   * assertion is here because this is where the blob it writes is read.
   */
  test("expands the oe ligature so both spellings are indexed", () => {
    expect(searchTextOf(["bœuf"]).split(" ")).toEqual(["bœuf", "boeuf"]);
  });

  test("does not store an already-unaccented term twice", () => {
    expect(searchTextOf(["onion"])).toBe("onion");
  });

  /** BM25 scores on term frequency, so a repeat is a silent thumb on the ranking scale. */
  test("de-duplicates a term repeated across inputs", () => {
    expect(searchTextOf(["basil", "basil"]).split(" ")).toEqual(["basil"]);
  });

  test("drops empty and whitespace-only terms rather than emitting a bare separator", () => {
    expect(searchTextOf(["onion", "", "   ", "leek"])).toBe("onion leek");
  });

  test("trims what it keeps", () => {
    expect(searchTextOf(["  onion  "])).toBe("onion");
  });

  test("answers an empty string for no terms", () => {
    expect(searchTextOf([])).toBe("");
  });
});

/**
 * The analyzer half: a blob is only de-duplicated if it is built out of the same units the index
 * splits it into. These pin the tokenizer this file mirrors, not an implementation detail — a
 * change to either drops rows out of searches with no other symptom.
 */
describe("searchTextOf tokenizes the way the index will", () => {
  test("splits a phrase into the tokens the index would store", () => {
    expect(searchTextOf(["pomme de terre"]).split(" ")).toEqual(["pomme", "de", "terre"]);
  });

  /** The bug this replaced: a phrase and its own words were three strings and two tokens. */
  test("de-duplicates a word against a phrase containing it", () => {
    expect(searchTextOf(["huile d'olive", "huile"]).split(" ")).toEqual(["huile", "olive"]);
  });

  /** The `elision` filter every French analyzer ships — `d'` leaves a `d` nobody searches for. */
  test("drops the single character an elision leaves behind", () => {
    expect(searchTextOf(["huile d'olive"])).not.toContain(" d ");
  });

  test("lowercases, so one spelling is stored once", () => {
    expect(searchTextOf(["Crème", "crème"]).split(" ")).toEqual(["crème", "creme"]);
  });

  test("splits on punctuation, not only on whitespace", () => {
    expect(searchTextOf(["sucre-glace"]).split(" ")).toEqual(["sucre", "glace"]);
  });

  /**
   * Composing one blob into another needs no splitter: handing a whole blob back in yields its
   * tokens, de-duplicated against everything beside them.
   */
  test("lets one blob be composed into another without duplicating anything", () => {
    const ingredient = searchTextOf(["crème", "crème fraîche"]);
    const recipe = searchTextOf(["tarte", ingredient]);

    const terms = recipe.split(" ");
    expect(new Set(terms).size).toBe(terms.length);
    expect(terms).toContain("creme");
    expect(terms).toContain("tarte");
  });

  test("is idempotent — re-serializing a blob changes nothing", () => {
    const blob = searchTextOf(["crème fraîche", "pomme de terre"]);

    expect(searchTextOf([blob])).toBe(blob);
  });
});
