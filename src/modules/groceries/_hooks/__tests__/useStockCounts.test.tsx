import { renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { Provider } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useStockCounts } from "../useStockCounts";

/**
 * The counts Home prints beside the list and the cellar are the grid's own rows, read off the same
 * derivation. Convex is mocked at `~/lib/convex/client`; the real `useSnapshot` and the real
 * `buildSections` sit above it.
 */
const state = vi.hoisted(() => ({
  groceryList: [] as Record<string, unknown>[],
  cellar: [] as Record<string, unknown>[],
  /** `undefined` is the catalog still in flight, which is how the first zero must not be printed. */
  ingredients: undefined as Record<string, unknown>[] | undefined,
  /** `undefined` is the products still in flight. */
  products: [] as Record<string, unknown>[] | undefined,
}));

vi.mock("~/hooks/useLocale", () => ({ useLocale: () => "fr" }));

vi.mock("~/modules/households/hooks", () => ({
  useHousehold: () => ({ householdId: "household-1", isLoading: false }),
}));

const SKIPPED = { data: undefined, isPending: true, isStale: false };

const answer = (fn: unknown) => {
  const name = getFunctionName(fn as Parameters<typeof getFunctionName>[0]);

  if (name.includes("getGroceryList")) return { data: state.groceryList, isPending: false, isStale: false };
  if (name.includes("getCellar")) return { data: state.cellar, isPending: false, isStale: false };
  if (name.includes("getRecentlyUsed")) return { data: [], isPending: false, isStale: false };
  if (name.includes("getPlatesOnList")) return { data: [], isPending: false, isStale: false };
  if (name.includes("getGroceryProducts")) return { data: state.products, isPending: state.products === undefined, isStale: false };
  if (name.includes("ingredients/list")) return { data: state.ingredients, isPending: state.ingredients === undefined, isStale: false };

  throw new Error(`Unmocked query: ${name}`);
};

vi.mock("~/lib/convex/client", () => {
  const client = {
  useQueryCached: (fn: unknown, args: unknown) => (args === "skip" ? SKIPPED : answer(fn)),
  useQueryHeld: (fn: unknown, args: unknown) => (args === "skip" ? SKIPPED : answer(fn)),
  };

  /** `useSnapshot` reads through `useQueryDevice`; held when it asks to be, cached otherwise. */
  return {
    ...client,
    useQueryDevice: (fn: unknown, args: unknown, options?: { hold?: boolean }) =>
      options?.hold ? client.useQueryHeld(fn, args) : client.useQueryCached(fn, args),
  };
});

const CARROT = "carrot-id";
const ONION = "onion-id";
const at = Date.now();

const INGREDIENTS = [
  { _id: CARROT, name: "Carottes", emoji: "🥕", category: "VEGETABLE" },
  { _id: ONION, name: "Oignons", emoji: "🧅", category: "VEGETABLE" },
];

/** A row of either table, in the shape Convex returns it. */
const row = (table: string, ingredientId: string, quantity: number) => ({
  _id: `${table}-${ingredientId}`,
  _creationTime: at,
  householdId: "household-1",
  ingredientId,
  unit: "pcs",
  quantity,
  updatedAt: at,
});

const counts = () => renderHook(() => useStockCounts(), { wrapper: Provider });

beforeEach(() => {
  state.groceryList = [];
  state.cellar = [];
  state.ingredients = INGREDIENTS;
  state.products = [];
});

describe("useStockCounts", () => {
  it("is zero on both sides while nothing is on the list or the shelf", () => {
    expect(counts().result.current).toEqual({ toBuy: 0, inStock: 0, isLoading: false });
  });

  /** The derivation drops a row it cannot name, so an unnamed table is a loading one, not an empty one. */
  it("is still loading while the rows are on the table but the catalog has not named them", () => {
    state.groceryList = [row("line", CARROT, 3)];
    state.ingredients = undefined;

    expect(counts().result.current).toMatchObject({ toBuy: 0, isLoading: true });
  });

  it("counts the rows each section draws", () => {
    state.groceryList = [row("line", CARROT, 3)];
    state.cellar = [row("cellar", ONION, 2)];

    expect(counts().result.current).toEqual({ toBuy: 1, inStock: 1, isLoading: false });
  });

  /** The number Home prints is the number of cards the shopper lands on, and a product is a card. */
  it("counts products with what is to buy, and never with the cellar", () => {
    state.groceryList = [row("line", CARROT, 3)];
    state.products = [
      { _id: "shampoo", name: "shampoo", emoji: "📦", quantity: 2, unit: "pcs", updatedAt: at },
      { _id: "soap", name: "soap", emoji: "📦", quantity: 1, unit: "pcs", updatedAt: at },
    ];

    expect(counts().result.current).toEqual({ toBuy: 3, inStock: 0, isLoading: false });
  });

  it("is still loading while the products have not answered", () => {
    state.products = undefined;

    expect(counts().result.current).toMatchObject({ toBuy: 0, isLoading: true });
  });

  /**
   * A line the shopper wrote is an instruction, not a claim, so the cellar holding the same thing
   * does not take it off the list — one ingredient can sit on both sides and count on both.
   */
  it("counts an ingredient on both sides when it is both wanted and owned", () => {
    state.groceryList = [row("line", CARROT, 3)];
    state.cellar = [row("cellar", CARROT, 5)];

    expect(counts().result.current).toEqual({ toBuy: 1, inStock: 1, isLoading: false });
  });
});
