import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useGroceryProducts } from "../useGroceryProducts";

const state = vi.hoisted(() => ({
  householdId: "household-1" as string | undefined,
  isResolvingHousehold: false,
  rows: undefined as Record<string, unknown>[] | undefined,
  args: undefined as unknown,
}));

vi.mock("~/modules/households/hooks", () => ({
  useHousehold: () => ({ householdId: state.householdId, isLoading: state.isResolvingHousehold }),
}));

vi.mock("~/lib/convex/client", () => ({
  /** A skipped query reports itself as pending, which is what convex-helpers actually does. */
  useQueryDevice: (_fn: unknown, args: unknown) => {
    state.args = args;

    return args === "skip"
      ? { data: undefined, isPending: true, isStale: false }
      : { data: state.rows, isPending: state.rows === undefined, isStale: false };
  },
}));

const T0 = new Date("2026-08-10T12:00:00Z").getTime();

const SHAMPOO = { _id: "shampoo", name: "shampoo", emoji: "📦", quantity: 2, unit: "pcs", updatedAt: T0 };

const render = () => renderHook(() => useGroceryProducts());

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  state.householdId = "household-1";
  state.isResolvingHousehold = false;
  state.rows = [];
  state.args = undefined;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useGroceryProducts", () => {
  it("skips the query with no household, and does not load forever", () => {
    state.householdId = undefined;

    expect(render().result.current).toMatchObject({ products: [], isLoading: false });
    expect(state.args).toBe("skip");
  });

  it("is loading while the household resolves", () => {
    state.householdId = undefined;
    state.isResolvingHousehold = true;

    expect(render().result.current.isLoading).toBe(true);
  });

  it("is loading while a household's query is pending", () => {
    state.rows = undefined;

    expect(render().result.current).toMatchObject({ products: [], isLoading: true });
  });

  it("maps a real row", () => {
    state.rows = [SHAMPOO];

    expect(render().result.current.products).toEqual([
      { id: "shampoo", name: "shampoo", emoji: "📦", amount: 2, unit: "pcs", updatedAt: new Date(T0) },
    ]);
  });
});
