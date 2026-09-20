import { act, renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWeeklyPlan } from "../useWeeklyPlan";
import { toDateParam } from "../../_model/model";
import { keptMeal } from "./fixtures";

/**
 * The seam `_model/model.test.ts` cannot reach: whether the range read's cards reach the strip in
 * the order a day is eaten, and whether a tap moves the user or only the selection.
 *
 * Convex is mocked at `~/lib/convex/client`, the one module a `_hooks/` file may reach it through;
 * the router at `expo-router`, which is the whole of the hook's reach into navigation. Everything
 * above those lines is real: the real model, the real day building, the real selection state.
 */
const state = vi.hoisted(() => ({
  meals: [] as unknown[],
  push: vi.fn(),
}));

vi.mock("expo-router", () => ({ router: { push: state.push } }));

vi.mock("~/hooks/useLocale", () => ({ useLocale: () => "fr" }));

vi.mock("~/modules/households/hooks", () => ({
  useHousehold: () => ({ householdId: "household-1", isLoading: false }),
}));

vi.mock("~/lib/convex/client", () => ({
  useQueryCached: (fn: unknown, args: unknown) => {
    if (args === "skip") return { data: undefined, isPending: true, isStale: false };

    const name = getFunctionName(fn as Parameters<typeof getFunctionName>[0]);
    if (name.includes("getMany")) return { data: state.meals, isPending: false, isStale: false };

    throw new Error(`Unmocked query: ${name}`);
  },
}));

beforeEach(() => {
  state.meals = [];
  state.push.mockReset();
});

const week = () => renderHook(() => useWeeklyPlan());

describe("useWeeklyPlan", () => {
  /** The same `dayStatusFor` answer the planning list's day markers give, so the screens agree. */
  it("builds seven days centred on today, marked by where they sit against it", () => {
    const { result } = week();

    expect(result.current.days).toHaveLength(7);
    expect(result.current.days.map((day) => day.status)).toEqual([
      "complete",
      "complete",
      "complete",
      "pending",
      "empty",
      "empty",
      "empty",
    ]);
  });

  /**
   * `getMany` orders by day only, so two plates on one day come back in write order — the eating
   * order is this hook's job, and so is carrying the plate image through the projection.
   */
  it("walks the range read in eating order, whatever order it arrived in", () => {
    state.meals = [
      keptMeal("tomorrow-dinner", 1, "dinner"),
      keptMeal("today-lunch", 0, "lunch"),
      {
        ...keptMeal("tomorrow-lunch", 1, "lunch"),
        recipe: { id: "recipe-r", title: "Ratatouille", minutes: 45, plateImageUrl: "https://plate.example/r.jpg" },
      },
    ];

    const { result } = week();

    expect(result.current.meals.map((meal) => meal.title)).toEqual([
      "Plat today-lunch",
      "Ratatouille",
      "Plat tomorrow-dinner",
    ]);
    expect(result.current.meals.map((meal) => meal.type)).toEqual(["lunch", "lunch", "dinner"]);
    expect(result.current.meals[1]!.imageSrc).toEqual({ uri: "https://plate.example/r.jpg" });
    expect(result.current.meals[0]!.imageSrc).toBeUndefined();
  });

  /**
   * A planned day can hold only one of the two slots, so toggling onto the empty one must fall back
   * to the day's other plate — a `-1` here would leave the carousel sitting where it was.
   */
  it("falls back to the day's other plate when the toggled slot has none", () => {
    state.meals = [keptMeal("tomorrow-dinner", 1, "dinner")];

    const { result } = week();

    act(() => result.current.selectMeal(result.current.meals[0]!));
    expect(result.current.selectedMealIndex).toBe(0);
    expect(result.current.mealType).toBe("dinner");

    act(() => result.current.toggleMealType());
    expect(result.current.mealType).toBe("lunch");
    expect(result.current.selectedMealIndex).toBe(0);
  });

  /** Opened in the evening, the toggle starts on dinner — that is the plate still to cook. */
  describe("the starting slot", () => {
    afterEach(() => vi.useRealTimers());

    it("is lunch in the morning and dinner from 18:00", () => {
      vi.useFakeTimers({ toFake: ["Date"] });

      vi.setSystemTime(new Date(2026, 7, 12, 9, 0));
      expect(week().result.current.mealType).toBe("lunch");

      vi.setSystemTime(new Date(2026, 7, 12, 20, 0));
      expect(week().result.current.mealType).toBe("dinner");
    });
  });

  /** A day tap is the way into the planning screen — a route, not a filter on the carousel. */
  it("opens the planning screen on the tapped day", () => {
    const { result } = week();
    const day = result.current.days[5]!;

    act(() => result.current.selectDay(day));

    expect(state.push).toHaveBeenCalledWith({
      pathname: "/planning",
      params: { date: toDateParam(day.date) },
    });
  });
});
