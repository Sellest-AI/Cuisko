import { renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { weekKeyOf } from "@shared/dates";

import { useWeekIdeas } from "../useWeekIdeas";

/**
 * The seam between the household resolving and the shelf asking: whether the query waits for a
 * household, and whether it asks for this week by the device's local Monday. Convex is mocked at
 * `~/lib/convex/client`, the one module a `_hooks/` file may reach it through.
 */
const state = vi.hoisted(() => ({
  householdId: "household-1" as string | undefined,
  isResolvingHousehold: false,
  ideas: [] as unknown[],
  lastArgs: undefined as unknown,
}));

vi.mock("~/hooks/useLocale", () => ({ useLocale: () => "fr" }));

vi.mock("~/modules/households/hooks", () => ({
  useHousehold: () => ({ householdId: state.householdId, isLoading: state.isResolvingHousehold }),
}));

vi.mock("~/lib/convex/client", () => ({
  useQueryCached: (fn: unknown, args: unknown) => {
    state.lastArgs = args;
    if (args === "skip") return { data: undefined, isPending: true, isStale: false };

    const name = getFunctionName(fn as Parameters<typeof getFunctionName>[0]);
    if (name.includes("getWeekIdeas")) return { data: state.ideas, isPending: false, isStale: false };

    throw new Error(`Unmocked query: ${name}`);
  },
}));

beforeEach(() => {
  state.householdId = "household-1";
  state.isResolvingHousehold = false;
  state.ideas = [];
  state.lastArgs = undefined;
});

describe("useWeekIdeas", () => {
  it("skips the query and answers no ideas until a household resolves", () => {
    state.householdId = undefined;
    state.isResolvingHousehold = true;

    const { result } = renderHook(() => useWeekIdeas());

    expect(state.lastArgs).toBe("skip");
    expect(result.current.ideas).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  /** A signed-in user with no household is not loading — there is nothing to wait for. */
  it("is not loading when there is no household to ask for", () => {
    state.householdId = undefined;

    const { result } = renderHook(() => useWeekIdeas());

    expect(result.current.isLoading).toBe(false);
  });

  it("asks for this week by the device's local Monday, and passes the cards through", () => {
    state.ideas = [{ id: "recipe-1", title: "Soupe", cuisine: "french", coverImageUrl: "https://img/1.jpg" }];

    const { result } = renderHook(() => useWeekIdeas());

    expect(state.lastArgs).toEqual({ householdId: "household-1", locale: "fr", weekKey: weekKeyOf(new Date()) });
    expect(result.current.ideas).toEqual(state.ideas);
    expect(result.current.isLoading).toBe(false);
  });
});
