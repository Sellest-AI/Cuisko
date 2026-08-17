/*
 * `useSuggestions` carries the hook naming its call site expects, but it holds no React state —
 * it is a pure function of the text typed. Calling it from a plain test helper is therefore safe,
 * which the rule cannot tell from the name alone. Scoped to this file rather than the shared
 * config, so it cannot quietly weaken the rule anywhere else.
 */
/* eslint-disable react-hooks/rules-of-hooks */
import { describe, expect, it } from "vitest";

import { useSuggestions } from "./useSuggestions";

/**
 * `useSuggestions` is named for where it is called, but it holds no React state — it is a pure
 * function of the text typed, so it is unit-tested directly, with no provider tree.
 *
 * It reads the placeholder catalogue it declares internally. When the catalogue arrives from
 * Convex these expectations move with it; what they pin is the matching, not the data.
 */
const idsOf = (text: string) => useSuggestions(text).suggestions.map((s) => s.id);
const matchOf = (text: string) => useSuggestions(text).matchingSuggestion?.id ?? null;

describe("stopwords", () => {
  it("keeps an accented word the English list would swallow once unaccented", () => {
    // "thé" normalises to "the", which IS an English stopword. Testing the stopword before the
    // accents come off is the only thing keeping tea searchable at all.
    expect(idsOf("thé")).toContain("green-tea");
  });

  it("still drops the article it is there to drop", () => {
    expect(idsOf("the")).toEqual([]);
  });
});

describe("auto-selection", () => {
  it("selects an ingredient named outright", () => {
    expect(matchOf("tomates")).toBe("tomatoes");
  });

  it("refuses a match that is merely the closest one", () => {
    // A typo still ranks the list, so the user gets somewhere to tap — but Enter must not commit
    // a guess on their behalf. This is the threshold the ambiguity check must not bypass.
    expect(idsOf("tomtes")).toContain("tomatoes");
    expect(matchOf("tomtes")).toBeNull();
  });

  it("says nothing until the input is long enough to mean something", () => {
    expect(matchOf("to")).toBeNull();
    expect(idsOf("to")).toEqual([]);
  });

  it("prefers the shorter name when two could be meant", () => {
    // "patates" is a synonym of pommes de terre and a prefix of patates douces. The shorter
    // label is the one that was typed.
    expect(matchOf("patates")).toBe("potatoes");
    expect(matchOf("patates douces")).toBe("sweet-potatoes");
  });
});

describe("synonyms", () => {
  it("finds an ingredient by a name it does not display", () => {
    const { matchingSuggestion } = useSuggestions("coulis de tomates");

    expect(matchingSuggestion?.id).toBe("tomato-sauce");
    // Searched, never shown: the card keeps the ingredient's own name.
    expect(matchingSuggestion?.name).toBe("Sauce tomate");
  });

  it("does not let a name and a synonym pool into one score", () => {
    expect(matchOf("chips de patates")).toBe("potato-chips");
  });
});

describe("quantity", () => {
  it("takes the quantity out of what it matches on", () => {
    // Regression: leaving "500g" among the words matched "500g tomate" against "tomate" and
    // dropped the score below the threshold, so a quantity silently cost you the match.
    expect(useSuggestions("500g tomates")).toMatchObject({
      amount: 500,
      unit: "g",
    });
    expect(matchOf("500g tomates")).toBe("tomatoes");
    expect(matchOf("500 g tomates")).toBe("tomatoes");
  });

  it("reads a fraction as the number it is", () => {
    expect(useSuggestions("1/2 kg patates")).toMatchObject({ amount: 0.5, unit: "kg" });
    expect(matchOf("1/2 kg patates")).toBe("potatoes");
  });

  it("falls back to one piece when nothing is said", () => {
    expect(useSuggestions("tomates")).toMatchObject({ amount: 1, unit: "pcs" });
  });

  it("counts pieces when a bare number is given", () => {
    expect(useSuggestions("2 patates douces")).toMatchObject({ amount: 2, unit: "pcs" });
  });
});
