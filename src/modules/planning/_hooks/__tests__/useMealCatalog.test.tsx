import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useMealCatalog } from "../useMealCatalog";

/**
 * The seam between the meal sheet and the recipes module: what the grid is made of, and where the
 * dish already on the plate goes.
 *
 * The recipes module is mocked at its public door, `~/modules/recipes/hooks` — the one path this
 * hook may reach it through. The list and the pinned read are each a value the test sets.
 */
type Card = { id: string; title: string; coverImageUrl?: string; plateImageUrl?: string };

const state = vi.hoisted(() => ({
  list: { recipes: [] as Card[], isSearching: false, isLoading: false, isStale: false },
  pinned: { recipe: undefined as Card | undefined },
  ideas: [] as Card[],
  asked: [] as { query: string; pinned: string | undefined }[],
}));

vi.mock("~/modules/recipes/hooks", () => ({
  useRecipeList: (query: string) => {
    state.asked.push({ query, pinned: undefined });

    return state.list;
  },
  useRecipe: (id: string | undefined) => {
    state.asked[state.asked.length - 1]!.pinned = id;

    return state.pinned;
  },
}));

/** The week's picks, set per test like the list — the hook reads only `ideas`. */
vi.mock("../useWeekIdeas", () => ({
  useWeekIdeas: () => ({ ideas: state.ideas, isLoading: false }),
}));

const card = (id: string, images: Pick<Card, "coverImageUrl" | "plateImageUrl"> = {}): Card => ({
  id, title: `Plat ${id}`, ...images,
});

beforeEach(() => {
  state.list = { recipes: [card("a"), card("b")], isSearching: false, isLoading: false, isStale: false };
  state.pinned = { recipe: undefined };
  state.ideas = [];
  state.asked = [];
});

const catalog = (query: string, pinnedId?: string) => renderHook(() => useMealCatalog(query, pinnedId));

describe("useMealCatalog", () => {
  it("hands the term to the list and the pinned id to the recipe read", () => {
    catalog("soupe", "recipe-z");

    expect(state.asked[0]).toEqual({ query: "soupe", pinned: "recipe-z" });
  });

  it("draws the list as it came, in its order, when nothing is pinned", () => {
    const { result } = catalog("");

    expect(result.current.recipes.map((choice) => choice.id)).toEqual(["a", "b"]);
  });

  it("puts the pinned dish first, even when the list does not hold it", () => {
    state.pinned = { recipe: card("z") };
    const { result } = catalog("soupe", "z");

    expect(result.current.recipes.map((choice) => choice.id)).toEqual(["z", "a", "b"]);
  });

  it("draws the pinned dish once when the list holds it too", () => {
    state.pinned = { recipe: card("b") };
    const { result } = catalog("", "b");

    expect(result.current.recipes.map((choice) => choice.id)).toEqual(["b", "a"]);
  });

  /** A grid that appears beats one that blinks in later; the pinned tile takes the front when it lands. */
  it("shows the list alone while the pinned dish is still being asked for", () => {
    const { result, rerender } = catalog("", "z");

    expect(result.current.recipes.map((choice) => choice.id)).toEqual(["a", "b"]);

    state.pinned = { recipe: card("z") };
    rerender();

    expect(result.current.recipes.map((choice) => choice.id)).toEqual(["z", "a", "b"]);
  });

  describe("alternatives", () => {
    const alternatives = [
      { id: "x", title: "Plat x" },
      { id: "b", title: "Plat b" },
      { id: "z", title: "Plat z" },
    ];

    it("follows the pinned dish, before the list, each recipe once", () => {
      state.pinned = { recipe: card("z") };
      const { result } = renderHook(() => useMealCatalog("", "z", alternatives));

      expect(result.current.recipes.map((choice) => choice.id)).toEqual(["z", "x", "b", "a"]);
    });

    /** A term means the cook wants something else: the matches stand alone. */
    it("steps aside while a term narrows the grid", () => {
      state.list = { ...state.list, isSearching: true };
      const { result } = renderHook(() => useMealCatalog("soupe", undefined, alternatives));

      expect(result.current.recipes.map((choice) => choice.id)).toEqual(["a", "b"]);
    });
  });

  describe("week ideas", () => {
    it("follow the cook's own recipes, each recipe once", () => {
      state.pinned = { recipe: card("z") };
      state.ideas = [card("i1", { coverImageUrl: "i1.png" }), card("a"), card("z"), card("i2")];
      const { result } = renderHook(() => useMealCatalog("", "z", [{ id: "x", title: "Plat x" }]));

      expect(result.current.recipes.map((choice) => choice.id)).toEqual(["z", "x", "a", "b", "i1", "i2"]);
      expect(result.current.recipes[4]!.imageSrc).toEqual({ uri: "i1.png" });
    });

    it("are drawn as plates, like every other tile", () => {
      state.list.recipes = [];
      state.ideas = [card("i1", { plateImageUrl: "plate.png", coverImageUrl: "cover.png" })];
      const { result } = catalog("");

      expect(result.current.recipes[0]!.imageSrc).toEqual({ uri: "plate.png" });
    });

    /** A library with nothing in it yet still offers the week's picks rather than an empty grid. */
    it("fill the grid alone when the cook has no recipes", () => {
      state.list.recipes = [];
      state.ideas = [card("i1"), card("i2")];
      const { result } = catalog("");

      expect(result.current.recipes.map((choice) => choice.id)).toEqual(["i1", "i2"]);
    });

    it("step aside while a term narrows the grid", () => {
      state.list = { ...state.list, isSearching: true };
      state.ideas = [card("i1")];
      const { result } = catalog("soupe");

      expect(result.current.recipes.map((choice) => choice.id)).toEqual(["a", "b"]);
    });
  });

  it("prefers the plate picture, falls back to the cover, and leaves a dish with neither to the screen", () => {
    state.list.recipes = [
      card("both", { plateImageUrl: "plate.png", coverImageUrl: "cover.png" }),
      card("cover", { coverImageUrl: "cover.png" }),
      card("none"),
    ];
    const { result } = catalog("");

    expect(result.current.recipes.map((choice) => choice.imageSrc)).toEqual([
      { uri: "plate.png" },
      { uri: "cover.png" },
      undefined,
    ]);
  });

  it("passes the list's flags through", () => {
    state.list = { ...state.list, isSearching: true, isLoading: true, isStale: true };
    const { result } = catalog("so");

    expect(result.current).toMatchObject({ isSearching: true, isLoading: true, isStale: true });
  });
});
