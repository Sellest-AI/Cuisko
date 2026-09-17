import { describe, expect, it } from "vitest";

import { rankSuggestions, readInput, type Suggestion } from "../useSuggestions";

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
  { id: "tomatoes", name: "Tomates", emoji: "🍅", defaultUnit: "pcs", defaultQuantity: 1 },
  { id: "cherry-tomatoes", name: "Tomates cerises", emoji: "🍅", defaultUnit: "pcs", defaultQuantity: 1 },
  { id: "tomato-sauce", name: "Sauce tomate", emoji: "🍶", aliases: ["coulis de tomates"], defaultUnit: "pcs", defaultQuantity: 1 },
  { id: "tomato-soup", name: "Soupe de tomates", emoji: "🥣", defaultUnit: "pcs", defaultQuantity: 1 },
  { id: "potatoes", name: "Pommes de terre", emoji: "🥔", aliases: ["patates"], defaultUnit: "pcs", defaultQuantity: 1 },
  {
    id: "potato-chips",
    name: "Chips de pommes de terre",
    emoji: "🍟",
    aliases: ["chips de patates"],
    defaultUnit: "pcs",
    defaultQuantity: 1,
  },
  { id: "sweet-potatoes", name: "Patates douces", emoji: "🍠", defaultUnit: "pcs", defaultQuantity: 1 },
  { id: "green-tea", name: "Thé vert", emoji: "🍵", defaultUnit: "pcs", defaultQuantity: 1 },
  // The row this file's default-unit case is about: a packet, never a countable one of them.
  { id: "gnocchi", name: "Gnocchis", emoji: "🥟", defaultUnit: "g", defaultQuantity: 500 },
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

  /**
   * Nothing said means nothing said, and the blank travels. Filling it here — with one piece of
   * whatever-it-is — is what made "gnocchis" a single gnocchi: this function knows a string, not a
   * food, so the two callers that DO know the row are the ones that answer.
   */
  it("leaves the quantity empty when nothing is said", () => {
    expect(rank("tomates")).toMatchObject({ amount: null, unit: null });
  });

  it("keeps a bare number and still leaves the unit to the ingredient", () => {
    expect(rank("2 patates douces")).toMatchObject({ amount: 2, unit: null });
  });

  /**
   * The blank has to be fillable, which means the matched row has to arrive carrying the answer.
   * Nobody buys one gnocchi: the catalog says 500 g, and this is what lets the caller say so.
   */
  it("hands the caller the row's own answer to fill the blank with", () => {
    const { matchingSuggestion, amount, unit } = rank("gnocchis");

    expect(amount).toBeNull();
    expect(unit).toBeNull();
    expect(matchingSuggestion).toMatchObject({ defaultUnit: "g", defaultQuantity: 500 });
  });

  /**
   * A butcher's ratio is not a fraction, and reading it as one cost twice over: "boeuf haché 95/5"
   * was billed as **19 pieces** of mince, and the 95/5 was stripped out of `rest` — so the term the
   * resolver was asked about had lost the one thing that said which mince it was.
   */
  it("reads an improper fraction as a grade, not as an amount", () => {
    expect(rank("boeuf hache 95/5")).toMatchObject({ amount: null, unit: null });
    expect(rank("boeuf hache 80/20")).toMatchObject({ amount: null, unit: null });
  });

  it("keeps the grade in the words the resolver is asked about", () => {
    expect(rank("boeuf hache 95/5").rest).toBe("boeuf hache 95/5");
    expect(rank("boeuf haché 5%").rest).toBe("boeuf haché 5%");
  });

  /**
   * The stored codes are English, and a French cook types the spelling the app used to store.
   * `readInput` must hand back `tbsp` — the CODE — because what it returns is written straight
   * into the grocery flow, where `vUnit` no longer holds `cs` and the save would fail.
   */
  it("reads a French spoon as the English code it is stored under", () => {
    expect(rank("2 cs huile")).toMatchObject({ amount: 2, unit: "tbsp" });
    expect(rank("1 cc sel")).toMatchObject({ amount: 1, unit: "tsp" });
    expect(rank("2cs huile")).toMatchObject({ amount: 2, unit: "tbsp" });
  });

  /**
   * And it must still be recognised as a UNIT, or it survives into the terms the catalog is
   * searched with — "cs" against an index that has never held it, diluting the one word that
   * would have matched.
   */
  it("keeps a French spoon out of the words the catalog is searched with", () => {
    expect(readInput("2 cs huile").words).not.toContain("cs");
    expect(rank("2 cs huile").rest).toBe("huile");
  });

  it("keeps the grade out of the words the catalog is searched with", () => {
    // A grade reaches the index as "955" once the slash is folded away, which matches nothing and
    // dilutes the two terms that would have. Same split `searchTerms` makes on the server.
    expect(rank("boeuf hache 95/5").suggestions).toEqual([]);
    expect(matchOf("1/2 kg patates")).toBe("potatoes");
  });
});
