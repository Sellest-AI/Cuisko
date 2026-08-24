import { act, renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { Provider } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useGroceryList } from "./useGroceryList";
import { useStockActions } from "./useStockActions";
import type { StockRow } from "../_model/model";

/**
 * The seam `_model/model.test.ts` cannot reach.
 *
 * Those tests prove `buildSections`, `putInCellar` and `peelReceipts` decide correctly, given sets
 * handed to them. They say nothing about whether these hooks wire the two together — that the rows
 * Convex returns reach the derivation in the shapes it expects, and that a tap sends the server the
 * number the model just computed.
 *
 * Convex is mocked at `~/lib/convex/client`, the one module a `_hooks/` file may reach it through.
 * Everything above that line is the real thing: the real `useSnapshot`, the real `useStockActions`,
 * the real `model.ts`. What is faked is the network, and nothing else.
 */
const state = vi.hoisted(() => ({
  groceryList: [] as Record<string, unknown>[],
  cellar: [] as Record<string, unknown>[],
  recentlyUsed: [] as Record<string, unknown>[],
  ingredients: undefined as Record<string, unknown>[] | undefined,
  calls: [] as { name: string; args: Record<string, unknown> }[],
  /** What `useQueryHeld` is holding, so a re-render can outlive a query going back in flight. */
  held: undefined as unknown,
  /** Makes the next mutation reject, for the tests that care what a failed write leaves behind. */
  rejectNext: false,
}));

vi.mock("~/hooks/useLocale", () => ({ useLocale: () => "fr" }));

vi.mock("~/modules/households/hooks", () => ({
  useHousehold: () => ({ householdId: "household-1", isLoading: false }),
}));

/**
 * `"skip"` reports itself as **pending**, which is what convex-helpers actually does — a skipped
 * query is not a finished one. A mock that answered `isPending: false` here would have hidden the
 * loading state from every test that touches it, so it is the real semantics or nothing.
 */
const SKIPPED = { data: undefined, isPending: true, isStale: false };

const answer = (fn: unknown) => {
  const name = getFunctionName(fn as Parameters<typeof getFunctionName>[0]);

  if (name.includes("getGroceryList")) return { data: state.groceryList, isPending: false };
  if (name.includes("getCellar")) return { data: state.cellar, isPending: false };
  if (name.includes("getRecentlyUsed")) return { data: state.recentlyUsed, isPending: false };
  if (name.includes("ingredients/list")) return { data: state.ingredients, isPending: false };

  throw new Error(`Unmocked query: ${name}`);
};

vi.mock("~/lib/convex/client", () => ({
  useQueryCached: (fn: unknown, args: unknown) =>
    args === "skip" ? SKIPPED : { ...answer(fn), isStale: false },

  /**
   * The held variant, holding for real rather than delegating — `state.ingredients` set to
   * `undefined` is how a test says "the names are in flight", and the previous ones must survive
   * it. Faking that as a pass-through would let the blanking bug back in unnoticed.
   */
  useQueryHeld: (fn: unknown, args: unknown) => {
    if (args === "skip") {
      state.held = undefined;
      return SKIPPED;
    }

    const live = answer(fn);
    if (live.data !== undefined) state.held = live.data;

    const data = live.data ?? state.held;

    return { ...live, data, isStale: live.data === undefined && data !== undefined };
  },

  useMutation: (fn: unknown) => {
    const name = getFunctionName(fn as Parameters<typeof getFunctionName>[0]);

    return {
      mutate: (args: Record<string, unknown>) => {
        state.calls.push({ name, args });

        return state.rejectNext
          ? Promise.reject(new Error("the server said no"))
          : Promise.resolve();
      },
    };
  },
}));

const CARROT = "carrot-id";
const at = Date.now();

/** A row of each table, in the shape Convex returns it. */
const line = (quantity: number) => ({
  _id: `line-${quantity}`,
  _creationTime: at,
  householdId: "household-1",
  ingredientId: CARROT,
  unit: "pcs",
  quantity,
  updatedAt: at,
});

const shelf = (quantity: number) => ({ ...line(quantity), _id: `cellar-${quantity}` });

/** Both hooks in one render, so a tap and the list it changes are read from the same tree. */
const groceries = () =>
  renderHook(() => ({ ...useGroceryList(), ...useStockActions() }), { wrapper: Provider });

const rowIn = (rows: StockRow[], id: string): StockRow => {
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) throw new Error(`No row "${id}". Present: ${rows.map((r) => r.id).join(", ")}`);

  return row;
};

const lastCall = () => state.calls[state.calls.length - 1];

beforeEach(() => {
  state.groceryList = [];
  state.cellar = [];
  state.recentlyUsed = [];
  state.ingredients = [{ _id: CARROT, name: "Carottes", emoji: "🥕" }];
  state.calls = [];
  state.held = undefined;
  state.rejectNext = false;
});

describe("useGroceryList", () => {
  it("draws a grocery-list row from what the database returned", () => {
    state.groceryList = [line(4)];

    const { result } = groceries();

    const row = rowIn(result.current.sections["to-buy"], `${CARROT}:pcs`);
    expect(row.amount).toBe(4);
    expect(row.name).toBe("Carottes");
  });

  it("draws what the cellar holds, and what is in neither as recently bought", () => {
    state.cellar = [shelf(2)];
    state.recentlyUsed = [{ ...line(6), _id: "history-6" }];

    const { result } = groceries();

    expect(rowIn(result.current.sections.cellar, `${CARROT}:pcs`).amount).toBe(2);
    // Owned, so it is not "recently bought" — that section is what the household has neither of.
    expect(result.current.sections["recently-bought"]).toHaveLength(0);
  });

  /**
   * The names arrive from a query keyed on the ids currently on screen, so every add and remove
   * re-keys it and puts it briefly back in flight. `buildSections` drops a row it cannot name, so
   * without holding the previous names the whole grid empties on each one — for a round trip, with
   * `isLoading` false, which reads as the list deleting itself.
   */
  it("keeps drawing the rows while their names are back in flight", () => {
    state.groceryList = [line(4)];

    const { result, rerender } = groceries();
    expect(rowIn(result.current.sections["to-buy"], `${CARROT}:pcs`).name).toBe("Carottes");

    // A second line changes the id set, so the names query re-keys and answers undefined.
    state.groceryList = [line(4), { ...line(2), _id: "line-2", ingredientId: "leek-id" }];
    state.ingredients = undefined;
    rerender();

    expect(rowIn(result.current.sections["to-buy"], `${CARROT}:pcs`).name).toBe("Carottes");
  });
});

describe("useStockActions", () => {
  it("sends a purchase to the cellar, and nothing else", async () => {
    state.groceryList = [line(4)];
    const { result } = groceries();

    await act(() => result.current.apply("buy", { ingredientId: CARROT, unit: "pcs" }, 4));

    expect(state.calls).toHaveLength(1);
    expect(lastCall()).toMatchObject({
      args: { householdId: "household-1", ingredientId: CARROT, unit: "pcs", quantity: 4 },
    });
    expect(lastCall()!.name).toContain("addToCellar");
  });

  it("gives back what the purchase struck off, and only that", async () => {
    // Four asked for by hand, four bought: the purchase settles the line, so undoing it has to
    // put the line back. The server deleted it and cannot know that — this number is why.
    state.groceryList = [line(4)];
    state.cellar = [];
    const { result, rerender } = groceries();

    await act(() => result.current.apply("buy", { ingredientId: CARROT, unit: "pcs" }, 4));

    // The purchase landed. Convex would push the new rows down; here they are handed over and the
    // tree re-read, which is the same thing from the hook's side.
    state.cellar = [shelf(4)];
    state.groceryList = [];
    rerender();

    await act(() => result.current.apply("remove", { ingredientId: CARROT, unit: "pcs" }, 4));

    expect(lastCall()!.name).toContain("removeFromCellar");
    expect(lastCall()!.args).toMatchObject({ quantity: 4, restoreToList: 4 });
  });

  it("restores nothing when the stock was never on anyone's list", async () => {
    state.cellar = [];
    const { result, rerender } = groceries();

    await act(() => result.current.apply("buy", { ingredientId: CARROT, unit: "pcs" }, 6));

    state.cellar = [shelf(6)];
    rerender();

    await act(() => result.current.apply("remove", { ingredientId: CARROT, unit: "pcs" }, 6));

    // Surplus goes back first and costs nothing: nobody had asked for it, so nothing is re-listed.
    expect(lastCall()!.args).toMatchObject({ restoreToList: 0 });
  });

  it("does not ask the server to take out stock the household does not have", async () => {
    state.cellar = [];
    const { result } = groceries();

    await act(() => result.current.apply("remove", { ingredientId: CARROT, unit: "pcs" }, 2));

    expect(state.calls).toHaveLength(0);
  });

  /**
   * A receipt is what a later undo peels to decide how much goes back on the list. Writing it
   * before the mutation is awaited leaves one standing for a purchase the server rejected, and the
   * next removal then asks the server to re-list a quantity nobody ever bought.
   */
  it("writes no receipt when the purchase is rejected", async () => {
    state.groceryList = [line(4)];
    state.rejectNext = true;

    const { result, rerender } = groceries();

    await act(() => result.current.apply("buy", { ingredientId: CARROT, unit: "pcs" }, 4));

    expect(result.current.error).toBeInstanceOf(Error);

    // The shelf has it anyway — bought elsewhere, or the row was already there. Taking it out must
    // restore nothing, because the failed purchase struck nothing off.
    state.rejectNext = false;
    state.cellar = [shelf(4)];
    rerender();

    await act(() => result.current.apply("remove", { ingredientId: CARROT, unit: "pcs" }, 4));

    expect(lastCall()!.name).toContain("removeFromCellar");
    expect(lastCall()!.args).toMatchObject({ restoreToList: 0 });
  });

  /** A rejected write reaches the caller as state, never as an unhandled rejection. */
  it("reports a failed write instead of rejecting", async () => {
    state.groceryList = [line(4)];
    state.rejectNext = true;

    const { result } = groceries();

    await act(() => result.current.forceRemove({ ingredientId: CARROT, unit: "pcs" }));

    expect(result.current.error?.message).toBe("the server said no");
  });

  it("strikes an ingredient off the list without touching the cellar", async () => {
    state.groceryList = [line(4)];
    state.cellar = [shelf(2)];
    const { result } = groceries();

    await act(() => result.current.forceRemove({ ingredientId: CARROT, unit: "pcs" }));

    expect(state.calls).toHaveLength(1);
    expect(lastCall()!.name).toContain("removeFromGroceryList");
    expect(lastCall()!.args).toMatchObject({ ingredientId: CARROT, unit: "pcs" });
  });
});
