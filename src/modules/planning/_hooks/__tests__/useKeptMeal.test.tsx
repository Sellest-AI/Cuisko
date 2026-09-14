import { act, renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useKeptMeal } from "../useKeptMeal";
import { keptMeal } from "./fixtures";

/**
 * The seam between the meal sheet and the server: which plate is asked for, what the slider shows
 * while a write is in flight, and what a refused write leaves behind.
 *
 * Convex is mocked at `~/lib/convex/client`, the one module a `_hooks/` file may reach it through.
 * The read is a status-and-data pair the test sets; each mutation is a promise the test settles,
 * so the order writes land in is the test's to choose.
 */
type Deferred = { resolve: () => void; reject: (error: unknown) => void };

const state = vi.hoisted(() => ({
  householdId: "household-1" as string | undefined,
  read: { status: "success" as "pending" | "success" | "error", data: undefined as unknown },
  queries: [] as { name: string; args: unknown }[],
  writes: [] as { name: string; args: Record<string, unknown>; settle: Deferred }[],
}));

vi.mock("~/hooks/useLocale", () => ({ useLocale: () => "fr" }));

vi.mock("~/modules/households/hooks", () => ({
  useHousehold: () => ({ householdId: state.householdId, isLoading: false }),
}));

vi.mock("~/lib/convex/client", () => ({
  useQueryCached: (fn: unknown, args: unknown) => {
    if (args === "skip") return { status: "pending", data: undefined };

    state.queries.push({ name: getFunctionName(fn as never), args });

    return state.read;
  },
  useMutation: (fn: unknown) => ({
    mutate: (args: Record<string, unknown>) =>
      new Promise<void>((resolve, reject) => {
        state.writes.push({ name: getFunctionName(fn as never), args, settle: { resolve, reject } });
      }),
  }),
}));

beforeEach(() => {
  state.householdId = "household-1";
  state.read = { status: "success", data: keptMeal("meal-1", 1, "lunch", { servings: 2 }) };
  state.queries = [];
  state.writes = [];
});

const kept = (mealId: string | undefined) => renderHook(() => useKeptMeal(mealId));

/** Lets the settled promise's continuation run inside React's act. */
const settle = (write: { settle: Deferred }, outcome: "ok" | "refused" = "ok") =>
  act(async () => {
    if (outcome === "ok") write.settle.resolve();
    else write.settle.reject(new Error("refused"));
    await Promise.resolve();
  });

describe("useKeptMeal", () => {
  it("asks for nothing without a plate to ask about", () => {
    const { result } = kept(undefined);

    expect(state.queries).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isMissing).toBe(false);
    expect(result.current.meal).toBeUndefined();
  });

  it("asks for the plate by id, for this household, in its locale", () => {
    kept("meal-1");

    expect(state.queries).toHaveLength(1);
    expect(state.queries[0]!.name).toContain("getOne");
    expect(state.queries[0]!.args).toEqual({ householdId: "household-1", locale: "fr", mealId: "meal-1" });
  });

  it("is loading until the first answer, then draws the plate as a card", () => {
    state.read = { status: "pending", data: undefined };
    const { result, rerender } = kept("meal-1");

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isMissing).toBe(false);

    state.read = { status: "success", data: keptMeal("meal-1", 1, "lunch", { servings: 3 }) };
    rerender();

    expect(result.current.isLoading).toBe(false);
    expect(result.current.meal).toMatchObject({ id: "meal-1", recipeId: "recipe-meal-1", servings: 3 });
    expect(result.current.servings).toBe(3);
  });

  /** A stale link, or a plate removed under an open sheet: the server says null, the sheet says gone. */
  it("is missing once the server answers null", () => {
    state.read = { status: "success", data: null };
    const { result } = kept("meal-1");

    expect(result.current.isMissing).toBe(true);
    expect(result.current.meal).toBeUndefined();
  });

  it("shows the portions being asked for until the server agrees, then the server's", async () => {
    const { result } = kept("meal-1");

    act(() => void result.current.setServings(4));

    expect(result.current.servings).toBe(4);
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0]!.name).toContain("setServings");
    expect(state.writes[0]!.args).toMatchObject({ householdId: "household-1", mealId: "meal-1", servings: 4 });
    expect(typeof state.writes[0]!.args.today).toBe("number");

    await settle(state.writes[0]!);

    // The read is a fixture and never moved; what matters is that the optimistic value let go.
    expect(result.current.servings).toBe(2);
    expect(result.current.failed).toBe(false);
  });

  /**
   * A drag across the slider is several writes in flight. The thumb must hold the LAST position
   * asked for until that write settles, not snap back when an earlier one lands.
   */
  it("keeps the last position asked for while an earlier write lands", async () => {
    const { result } = kept("meal-1");

    act(() => void result.current.setServings(3));
    act(() => void result.current.setServings(5));

    await settle(state.writes[0]!);

    expect(result.current.servings).toBe(5);

    await settle(state.writes[1]!);

    expect(result.current.servings).toBe(2);
  });

  it("hands the slider back to the server's value and says so when a write is refused", async () => {
    const { result } = kept("meal-1");

    act(() => void result.current.setServings(6));
    await settle(state.writes[0]!, "refused");

    expect(result.current.servings).toBe(2);
    expect(result.current.failed).toBe(true);
  });

  it("resolves whether the plate actually went", async () => {
    const { result } = kept("meal-1");

    let went: Promise<boolean> | undefined;
    act(() => { went = result.current.remove(); });
    await settle(state.writes[0]!, "refused");

    expect(await went).toBe(false);
    expect(result.current.failed).toBe(true);
    expect(state.writes[0]!.name).toContain("removeOne");
    expect(state.writes[0]!.args).toMatchObject({ householdId: "household-1", mealId: "meal-1" });
    expect(typeof state.writes[0]!.args.today).toBe("number");

    act(() => { went = result.current.remove(); });
    await settle(state.writes[1]!);

    expect(await went).toBe(true);
    expect(result.current.failed).toBe(false);
  });
});
