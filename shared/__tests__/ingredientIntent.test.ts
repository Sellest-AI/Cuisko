import { describe, expect, test } from "vitest";

import { CHAT_TRIGGERS, readIntent } from "../ingredientIntent";

/** The bar has already found a confident match for these. */
const MATCHED = true;
/** The catalog answered nothing. */
const MISSED = false;
/** The bar's panel is showing recipes: a dish is named by this, and the catalog could not explain it. */
const NAMES_A_DISH = true;

describe("the rule order", () => {
  /**
   * The one assertion this whole file exists for. Reversing these two rules is the mistake that
   * costs a shopper their question: every "what can I do with tomatoes" would silently add
   * tomatoes to the list and answer nothing.
   */
  test("an explicit question beats a catalog hit", () => {
    expect(readIntent("? tomate", MATCHED)).toEqual({ kind: "chat", reason: "question" });
    expect(readIntent("tomate", MATCHED)).toEqual({ kind: "ingredient" });
  });

  test("a trigger word beats a catalog hit", () => {
    expect(readIntent("show me tomate", MATCHED)).toEqual({ kind: "chat", reason: "trigger" });
  });

  /** A hit stops the word count from ever running, so a long-named food is never a sentence. */
  test("a catalog hit beats the sentence heuristic", () => {
    expect(readIntent("farine de ble complete bio type 65", MATCHED)).toEqual({
      kind: "ingredient",
    });
  });
});

describe("an explicit question", () => {
  test("is read wherever the mark sits", () => {
    for (const text of ["?", "quoi ce soir ?", "? tomate", "des idees ?"])
      expect(readIntent(text, MISSED)).toEqual({ kind: "chat", reason: "question" });
  });
});

describe("a trigger", () => {
  test("is read in first position, in either language", () => {
    expect(readIntent("comment cuire un oeuf", MISSED)).toEqual({
      kind: "chat",
      reason: "trigger",
    });
    expect(readIntent("how do i cook an egg", MISSED)).toEqual({
      kind: "chat",
      reason: "trigger",
    });
  });

  test("is read past its accents, because a French keyboard writes them", () => {
    expect(readIntent("Où est le sel", MISSED)).toEqual({ kind: "chat", reason: "trigger" });
  });

  /**
   * The rule that lets the trigger list stay short. Matched anywhere, "ou" turns a two-item
   * shopping note into a question, and "can" is one keystroke from doing the same in English.
   */
  test("is not read anywhere else in the phrase", () => {
    expect(readIntent("pommes ou poires", MISSED)).toEqual({ kind: "unknown" });
    expect(readIntent("tomate est", MISSED)).toEqual({ kind: "unknown" });
  });

  test("every listed word is one, and no list is empty", () => {
    for (const [, triggers] of Object.entries(CHAT_TRIGGERS)) {
      expect(triggers.length).toBeGreaterThan(0);
      for (const trigger of triggers)
        expect(readIntent(`${trigger} something`, MISSED).kind).toBe("chat");
    }
  });
});

describe("the sentence heuristic", () => {
  test("reads four content words as a sentence", () => {
    expect(readIntent("plat rapide sans gluten enfants", MISSED)).toEqual({
      kind: "chat",
      reason: "sentence",
    });
  });

  /**
   * Stopwords and shopping grammar are taken out before the count, so the longest real ingredient
   * label still falls under the threshold and reaches the resolver.
   */
  test("does not count stopwords, quantities or units", () => {
    expect(readIntent("500 g de farine de ble complete", MISSED)).toEqual({ kind: "unknown" });
    expect(readIntent("1,5kg de pommes de terre", MISSED)).toEqual({ kind: "unknown" });
  });

  /**
   * A unit is whatever a shopper may WRITE, not whatever is stored. The codes went English, and a
   * French cook goes on typing `cs` — counted as a content word it tips this phrase over the
   * threshold and the bar answers with the assistant instead of the shopping list. No error, no
   * symptom: just the wrong one of the three things the bar can do.
   */
  test("does not count a unit spelled the way a French cook writes it", () => {
    expect(readIntent("2 cs huile olive vierge", MISSED)).toEqual({ kind: "unknown" });
    expect(readIntent("2 tbsp huile olive vierge", MISSED)).toEqual({ kind: "unknown" });
    expect(readIntent("1 cc sel fin de guerande", MISSED)).toEqual({ kind: "unknown" });
  });
});

describe("what is left", () => {
  /** The case this slice exists for: not a question, not known, not long enough to be a sentence. */
  test("is unknown, and the resolver gets a turn", () => {
    for (const text of ["yuzu", "graines de nigelle", "harissa rose"])
      expect(readIntent(text, MISSED)).toEqual({ kind: "unknown" });
  });

  /**
   * Empty is `unknown` rather than `chat` so that a stray Enter cannot open the assistant with
   * nothing to say. The bar guards it before calling anything — this is the second line.
   */
  test("treats empty and blank text as unknown", () => {
    expect(readIntent("", MISSED)).toEqual({ kind: "unknown" });
    expect(readIntent("   ", MATCHED)).toEqual({ kind: "unknown" });
  });
});

/**
 * The fourth kind, and where it sits: below the catalog, above the word count.
 *
 * What Enter does has to match the list the cook is looking at, so the bar hands its own ruling in
 * rather than letting this re-derive one. Everything here is about the ORDER, which is the only
 * part a diff cannot show.
 */
describe("a dish by name", () => {
  test("goes to the recipes page", () => {
    expect(readIntent("boeuf bourguignon", MISSED, NAMES_A_DISH)).toEqual({ kind: "recipe" });
  });

  /**
   * The case that stops a dish becoming an ingredient. Two content words is under the sentence
   * threshold, so before this rule existed it fell to `unknown` — and the resolver, which invents
   * the row it cannot find, left "boeuf bourguignon" in the food catalog with a generated picture.
   */
  test("beats the sentence heuristic in both directions", () => {
    expect(readIntent("boeuf bourguignon", MISSED)).toEqual({ kind: "unknown" });
    expect(readIntent("gratin dauphinois aux cepes frais", MISSED, NAMES_A_DISH)).toEqual({
      kind: "recipe",
    });
  });

  /** A food the catalog holds is a shopping item, even when a dish is named the same thing. */
  test("loses to a catalog hit", () => {
    expect(readIntent("tomate", MATCHED, NAMES_A_DISH)).toEqual({ kind: "ingredient" });
  });

  /** And an explicit question still beats both, the way it beats a catalog hit. */
  test("loses to an explicit question and to a trigger", () => {
    expect(readIntent("? boeuf bourguignon", MISSED, NAMES_A_DISH)).toEqual({
      kind: "chat",
      reason: "question",
    });
    // "recette" is a trigger in first position, so this asks the assistant for one rather than
    // searching the library. Deliberate: the cook led with the question.
    expect(readIntent("recette de boeuf bourguignon", MISSED, NAMES_A_DISH)).toEqual({
      kind: "chat",
      reason: "trigger",
    });
  });

  /** Absent, it changes nothing — every caller that never saw a recipe behaves as it always did. */
  test("defaults to off", () => {
    expect(readIntent("boeuf bourguignon", MISSED)).toEqual({ kind: "unknown" });
  });
});
