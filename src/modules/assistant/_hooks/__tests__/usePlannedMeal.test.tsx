import { act, renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MealPlanned } from "@shared/assistant";
import { startOfDay } from "@shared/clock";

import { usePlannedMeal } from "../usePlannedMeal";

/**
 * The chat's planned plate: which card it draws, when it can still be undone, and what the undo
 * sends. Convex is mocked at `~/lib/convex/client`, the one module a `_hooks/` file reaches it by.
 */
const state = vi.hoisted(() => ({
  /** What the week answers for the plate: a card, `null` once it is gone. */
  plate: { status: "success", data: undefined as unknown },
  writes: [] as { name: string; args: Record<string, unknown> }[],
  /** The write names that are refused. */
  refused: new Set<string>(),
}));

vi.mock("~/hooks/useLocale", () => ({ useLocale: () => "fr" }));

vi.mock("~/lib/convex/client", () => ({
  useQuery: (fn: unknown) =>
    getFunctionName(fn as never) === "router/recipes/getMany:authed"
      ? { status: "success", data: [{ id: "lasagne", title: "Lasagnes", minutes: 60, plateImageUrl: "https://img/lasagne.png" }] }
      : state.plate,
  useMutation: (fn: unknown) => ({
    isLoading: false,
    mutate: async (args: Record<string, unknown>) => {
      const name = getFunctionName(fn as never);
      state.writes.push({ name, args });
      if (state.refused.has(name)) throw new Error("refused");
    },
  }),
}));

const DAY = 86_400_000;
const today = () => startOfDay(new Date()).getTime();

/** Lasagne for four, tonight's dinner, in place of a curry for three. */
const lasagne = (overrides: Partial<MealPlanned> = {}): MealPlanned => ({
  v: 1,
  status: "planned",
  householdId: "home",
  plannedMealId: "plate-1",
  recipeId: "lasagne",
  date: today(),
  slot: "dinner",
  servings: 4,
  replaced: { recipeId: "curry", servings: 3 },
  ...overrides,
});

const _plate = (status: string) => ({ status: "success", data: { id: "plate-1", status } });

/** A store of its own per test, so an undo recorded in one never shows in the next. */
const render = (meal: MealPlanned) => {
  const store = createStore();
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  return renderHook(() => usePlannedMeal(meal, "message-1:call-1"), { wrapper });
};

beforeEach(() => {
  state.plate = _plate("ready");
  state.writes = [];
  state.refused = new Set();
});

describe("usePlannedMeal", () => {
  it("draws the recipe's card, on its day and meal, with the undo offered", () => {
    const { result } = render(lasagne());

    expect(result.current.card).toEqual({ title: "Lasagnes", imageUrl: "https://img/lasagne.png", minutes: 60 });
    expect(result.current.slot).toBe("dinner");
    expect(result.current.isCanceled).toBe(false);
    expect(result.current.canUndo).toBe(true);
  });

  /**
   * A day that has passed cannot be planned again, so an undo there would take the lasagne off and
   * never put the curry back. The undo is only offered while it can restore both.
   */
  it("does not offer the undo once the plate's day has passed", () => {
    const { result } = render(lasagne({ date: today() - DAY }));

    expect(result.current.canUndo).toBe(false);
    expect(result.current.isCanceled).toBe(false);
  });

  it("takes the plate off, then plans the dish it replaced on the same day and meal", async () => {
    const { result } = render(lasagne());

    await act(() => result.current.undo());

    expect(state.writes).toEqual([
      { name: "router/planning/removeOne:authed", args: { householdId: "home", mealId: "plate-1", today: today() } },
      {
        name: "router/planning/planOne:authed",
        args: { householdId: "home", recipeId: "curry", date: today(), slot: "dinner", servings: 3, today: today() },
      },
    ]);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.isCanceled).toBe(true);
  });

  it("only takes the plate off when it took an empty slot", async () => {
    const { result } = render(lasagne({ replaced: undefined }));

    await act(() => result.current.undo());

    expect(state.writes.map((write) => write.name)).toEqual(["router/planning/removeOne:authed"]);
  });

  /** Nothing moved, so nothing is recorded: the pill stays, and a second press retries. */
  it("keeps the undo offered when taking the plate off is refused", async () => {
    state.refused.add("router/planning/removeOne:authed");
    const { result } = render(lasagne());

    await act(() => result.current.undo());

    expect(state.writes.map((write) => write.name)).toEqual(["router/planning/removeOne:authed"]);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.isCanceled).toBe(false);
  });

  /** Removed from the planning screen, or replaced by another dish: a new plate, so this one is gone. */
  it("reads as canceled once the plate is off the week, with nothing to undo", () => {
    state.plate = { status: "success", data: null };
    const { result } = render(lasagne());

    expect(result.current.isCanceled).toBe(true);
    expect(result.current.canUndo).toBe(false);
  });

  /** A cooked plate is still the plate Cuisko planned: not canceled, and past taking back. */
  it("neither cancels nor offers the undo for a cooked plate", () => {
    state.plate = _plate("cooked");
    const { result } = render(lasagne());

    expect(result.current.isCanceled).toBe(false);
    expect(result.current.canUndo).toBe(false);
  });

  it("is not canceled while the plate is still loading", () => {
    state.plate = { status: "pending", data: undefined };
    const { result } = render(lasagne());

    expect(result.current.isCanceled).toBe(false);
  });
});
