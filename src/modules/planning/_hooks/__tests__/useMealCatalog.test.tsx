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

const card = (id: string, images: Pick<Card, "coverImageUrl" | "plateImageUrl"> = {}): Card => ({
  id, title: `Plat ${id}`, ...images,
});

beforeEach(() => {
  state.list = { recipes: [card("a"), card("b")], isSearching: false, isLoading: false, isStale: false };
  state.pinned = { recipe: undefined };
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
