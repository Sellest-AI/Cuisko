import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useBarSuggestions } from "../useBarSuggestions";

/**
 * The bar's ruling: ingredient or recipe, never both.
 *
 * Two seams are mocked and one rule is deliberately left real. The recipes module is mocked at its
 * public door, `~/modules/recipes/hooks`, and the catalog half is mocked down to the one field the
 * ruling reads — `isFullyCovered`, whose own behaviour is pinned in `useSuggestions.test.ts`.
 * `coversTitle` stays REAL, because it is the half of gate 2 this file exists to check: a fixture
 * that also faked the title filter could only ever assert that the mock was wired up.
 */
type Card = { id: string; title: string };

const state = vi.hoisted(() => ({
  ingredient: { isFullyCovered: false, hasSuggestions: false },
  matches: { recipes: [] as Card[], isSearching: false, isLoading: false, isStale: false },
  /**
   * The term the mocked matches are for. `null` means "whatever was typed", which is the settled
   * case every gate test wants; a string is how the debounce window is pinned, since that window
   * is exactly the moment these two disagree.
   */
  term: null as string | null,
  /** What the catalog half took the input to be, once the shopping grammar is out of it. */
  rest: null as string | null,
  /** What the recipe search was actually asked for, which is a wiring claim rather than a rule. */
  asked: "",
}));

vi.mock("~/modules/recipes/hooks", () => ({
  useRecipeMatches: (query: string) => {
    state.asked = query;

    return { ...state.matches, term: state.term ?? query.trim() };
  },
}));

vi.mock("../useSuggestions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../useSuggestions")>()),
  useSuggestions: (text: string) => ({ ...state.ingredient, rest: state.rest ?? text.trim() }),
}));

const rule = (text: string) => renderHook(() => useBarSuggestions(text)).result.current;

beforeEach(() => {
  state.ingredient = { isFullyCovered: false, hasSuggestions: false };
  state.matches = { recipes: [], isSearching: false, isLoading: false, isStale: false };
  state.term = null;
  state.rest = null;
  state.asked = "";
});

describe("what the recipe search is asked for", () => {
  /**
   * A quantity is shopping grammar, not part of a name. Left in, "2" and "kg" are two more terms
   * competing for one page of results, and the dish the cook named can be crowded off it — which
   * lands the whole input back on the resolver, the one outcome this slice exists to prevent.
   */
  it("asks without the quantity the catalog half already took out", () => {
    state.rest = "boeuf bourguignon";

    rule("2 kg boeuf bourguignon");

    expect(state.asked).toBe("boeuf bourguignon");
  });
});

describe("gate 1 — the catalog explains the whole input", () => {
  it("stays on ingredients even when a recipe title matches too", () => {
    // The case a relevance comparison gets wrong. "beurre" is a strong hit on both sides, and the
    // shopper still means the food: a cook who cannot add butter to a list has lost the bar.
    state.ingredient = { isFullyCovered: true, hasSuggestions: true };
    state.matches.recipes = [{ id: "r1", title: "Beurre blanc" }];

    expect(rule("beurre").kind).toBe("ingredient");
  });

  it("reports the ingredient list as what there is to draw", () => {
    state.ingredient = { isFullyCovered: true, hasSuggestions: true };

    expect(rule("beurre").hasSuggestions).toBe(true);
  });
});

describe("gate 2 — a word the catalog cannot explain", () => {
  it("offers recipes when one of them is named by the input", () => {
    state.matches.recipes = [{ id: "r1", title: "Boeuf bourguignon" }];

    const ruling = rule("boeuf bourguignon");

    expect(ruling.kind).toBe("recipe");
    expect(ruling.recipes.map((r) => r.id)).toEqual(["r1"]);
  });

  it("keeps only the recipes whose title the input covers", () => {
    // The search ranks its own answer and returns both; the bar is a short list under a keyboard,
    // and a dish the cook did not name has no business in it.
    state.matches.recipes = [
      { id: "named", title: "Boeuf bourguignon" },
      { id: "blob", title: "Salade de tomates" },
    ];

    expect(rule("boeuf bourguignon").recipes.map((r) => r.id)).toEqual(["named"]);
  });
});

describe("gate 3 — nothing answers it", () => {
  /**
   * The regression this whole client-side filter exists for.
   *
   * `searchForUser` scans what a recipe CONTAINS as well as what it is called, and Convex matches
   * any term rather than all of them — so an uncovered input comes back full of recipes that share
   * one word with it and answer none of it. If those decided gate 2, almost every unknown food
   * would be read as a dish and the resolver would stop being reachable.
   */
  it("falls back to ingredients when the matches are only ingredient-blob hits", () => {
    state.matches.recipes = [
      { id: "blob1", title: "Tarte au citron" },
      { id: "blob2", title: "Poulet rôti" },
    ];

    const ruling = rule("huile olive vierge extra");

    expect(ruling.kind).toBe("ingredient");
    expect(ruling.recipes).toEqual([]);
  });

  it("stays on ingredients when the search returned nothing at all", () => {
    expect(rule("yuzu").kind).toBe("ingredient");
  });
});

describe("the debounce window", () => {
  /**
   * The filter narrows the held cards by the term they were fetched for, not by the live text.
   * Judging "Boeuf bourguignon" by a half-typed "boeuf bourg" drops it for a word the server was
   * never asked about, and the panel flips back to ingredients between keystrokes.
   */
  it("keeps the held recipes while a longer term is still being typed", () => {
    state.term = "boeuf";
    state.matches.recipes = [{ id: "r1", title: "Boeuf bourguignon" }];

    const ruling = rule("boeuf bourg");

    expect(ruling.recipes.map((r) => r.id)).toEqual(["r1"]);
    expect(ruling.kind).toBe("recipe");
  });
});
