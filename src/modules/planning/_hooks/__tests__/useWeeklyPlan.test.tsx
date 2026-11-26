import { act, renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWeeklyPlan } from "../useWeeklyPlan";
import { toDateParam } from "@shared/dates";

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
  /** What the range read is doing, so `isEmpty` can be asked about a read that has not answered. */
  status: "success" as "success" | "pending" | "error",
  /** The household in view: none, and none on the way, is a guest. */
  household: { householdId: "household-1", isLoading: false } as { householdId?: string; isLoading: boolean },
  /** Who is looking: a cook with a session, unless a test says a guest. */
  auth: { hasSession: true, isAuthenticating: false },
  push: vi.fn(),
}));

vi.mock("expo-router", () => ({ router: { push: state.push } }));

vi.mock("~/hooks/useLocale", () => ({ useLocale: () => "fr" }));

vi.mock("~/lib/convex/auth", () => ({ useAuthenticated: () => state.auth }));

vi.mock("~/modules/households/hooks", () => ({
  useHousehold: () => state.household,
}));

vi.mock("~/lib/convex/client", () => ({
  useQueryDevice: (fn: unknown, args: unknown) => {
    if (args === "skip") return { data: undefined, isPending: true, isSuccess: false, isStale: false };

    const name = getFunctionName(fn as Parameters<typeof getFunctionName>[0]);
    if (name.includes("getMany"))
      return {
        data: state.status === "success" ? state.meals : undefined,
        isPending: state.status === "pending",
        isSuccess: state.status === "success",
        isStale: false,
      };

    throw new Error(`Unmocked query: ${name}`);
  },
}));

beforeEach(() => {
  state.meals = [];
  state.household = { householdId: "household-1", isLoading: false };
  state.auth = { hasSession: true, isAuthenticating: false };
  state.status = "success";
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

  /**
   * The empty state replaces the whole week on Home, so this flag has to mean "there is nothing
   * planned" and never "we have not been told yet". A read that is still in flight or that failed
   * leaves `meals` empty too, and answering `true` to either would announce an empty week the
   * household may not have.
   */
  describe("isEmpty", () => {
    it("is true only once the range read has answered with nothing", () => {
      expect(week().result.current.isEmpty).toBe(true);
    });

    it("is false while the read is in flight", () => {
      state.status = "pending";

      expect(week().result.current.isEmpty).toBe(false);
    });

    it("is false when the read failed", () => {
      state.status = "error";

      expect(week().result.current.isEmpty).toBe(false);
    });

    /** Home is open signed out: a guest has no week to read, and is shown the empty one. */
    it("is true for a guest, who has no household and none on the way", () => {
      state.household = { householdId: undefined, isLoading: false };
      state.auth = { hasSession: false, isAuthenticating: false };

      expect(week().result.current.isEmpty).toBe(true);
    });

    /** "Continuer avec Google" tapped: auth is busy, but nothing is stored yet, and no week is coming. */
    it("stays true for a guest while their sign-in is in flight", () => {
      /** As `useHousehold` answers then: loading while auth is busy, session or not. */
      state.household = { householdId: undefined, isLoading: true };
      state.auth = { hasSession: false, isAuthenticating: true };

      expect(week().result.current.isEmpty).toBe(true);
    });

    /** Signed in, between the cook's row and their household's: their week is on the way, not empty. */
    it("is false for a signed-in cook whose household has not arrived", () => {
      state.household = { householdId: undefined, isLoading: false };

      expect(week().result.current.isEmpty).toBe(false);
    });

    it("is false while the household is still being resolved", () => {
      state.household = { householdId: undefined, isLoading: true };

      expect(week().result.current.isEmpty).toBe(false);
    });

    it("is false as soon as one plate is planned", () => {
      state.meals = [keptMeal("a", 0, "dinner")];

      expect(week().result.current.isEmpty).toBe(false);
    });
  });
});
