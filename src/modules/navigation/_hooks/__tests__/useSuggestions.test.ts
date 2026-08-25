import { describe, expect, it } from "vitest";

import { rankSuggestions, type Suggestion } from "../useSuggestions";

/**
 * The ranking, tested against a fixture rather than against the catalog.
 *
 * `useSuggestions` now asks Convex for its candidates, so the hook itself is a fetch and a call to
 * this. What is worth pinning is the second half — which candidate a typed string means — and that
 * is a pure function, so it needs no provider tree and no database.
 *
 * The fixture is the placeholder list this file used to reach for through the hook. Kept
 * deliberately: it holds the near-collisions the thresholds exist for (patates vs. patates douces,
 * a name against a synonym, thé against the English stopword list), which a sample of real catalog
 * rows would not reliably contain.
 */
const CATALOGUE: Suggestion[] = [
  { id: "tomatoes", name: "Tomates", emoji: "🍅" },
  { id: "cherry-tomatoes", name: "Tomates cerises", emoji: "🍅" },
  { id: "tomato-sauce", name: "Sauce tomate", emoji: "🍶", aliases: ["coulis de tomates"] },
  { id: "tomato-soup", name: "Soupe de tomates", emoji: "🥣" },
  { id: "potatoes", name: "Pommes de terre", emoji: "🥔", aliases: ["patates"] },
  {
    id: "potato-chips",
    name: "Chips de pommes de terre",
    emoji: "🍟",
    aliases: ["chips de patates"],
  },
  { id: "sweet-potatoes", name: "Patates douces", emoji: "🍠" },
  { id: "green-tea", name: "Thé vert", emoji: "🍵" },
];

const rank = (text: string) => rankSuggestions(text, CATALOGUE);

const idsOf = (text: string) => rank(text).suggestions.map((s) => s.id);
const matchOf = (text: string) => rank(text).matchingSuggestion?.id ?? null;

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
    const { matchingSuggestion } = rank("coulis de tomates");

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
    expect(rank("500g tomates")).toMatchObject({
      amount: 500,
      unit: "g",
    });
    expect(matchOf("500g tomates")).toBe("tomatoes");
    expect(matchOf("500 g tomates")).toBe("tomatoes");
  });

  it("reads a fraction as the number it is", () => {
    expect(rank("1/2 kg patates")).toMatchObject({ amount: 0.5, unit: "kg" });
    expect(matchOf("1/2 kg patates")).toBe("potatoes");
  });

  it("falls back to one piece when nothing is said", () => {
    expect(rank("tomates")).toMatchObject({ amount: 1, unit: "pcs" });
  });

  it("counts pieces when a bare number is given", () => {
    expect(rank("2 patates douces")).toMatchObject({ amount: 2, unit: "pcs" });
  });
});
