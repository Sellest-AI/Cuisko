import { act, renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePlanningList } from "../usePlanningList";
import type { MealCard, PlanningRow } from "../../_model/model";
import { keptMeal } from "./fixtures";

/**
 * The seam `_model/model.test.ts` cannot reach: whether the two paginated cursors meet at the focus
 * day the way the screen needs them to — the earlier week reversed above the later one, both asking
 * for the same `from`, and a scroll paging the cursor it came from.
 *
 * Convex is mocked at `~/lib/convex/client`, the one module a `_hooks/` file may reach it through.
 * Everything above that line is real: the real model, the real row shaping, the real loading gate.
 * What is faked is the network, and nothing else.
 */
const state = vi.hoisted(() => ({
  householdId: "household-1" as string | undefined,
  pages: {
    before: { results: [] as unknown[], status: "CanLoadMore", loadMoreCalls: [] as number[] },
    after: { results: [] as unknown[], status: "CanLoadMore", loadMoreCalls: [] as number[] },
  },
  queries: [] as { name: string; direction: string; args: Record<string, unknown> }[],
}));

vi.mock("~/hooks/useLocale", () => ({ useLocale: () => "fr" }));

vi.mock("~/modules/households/hooks", () => ({
  useHousehold: () => ({ householdId: state.householdId, isLoading: false }),
}));

vi.mock("~/lib/convex/client", () => ({
  usePaginatedQueryCached: (fn: unknown, args: unknown) => {
    // A skipped query reports itself as still loading — the real convex-helpers semantics, which
    // the no-household test below depends on.
    if (args === "skip") return { results: [], status: "LoadingFirstPage", loadMore: () => undefined };

    const { direction } = args as { direction: "before" | "after" };
    state.queries.push({
      name: getFunctionName(fn as Parameters<typeof getFunctionName>[0]),
      direction,
      args: args as Record<string, unknown>,
    });

    const page = state.pages[direction];

    return {
      results: page.results,
      status: page.status,
      loadMore: (numItems: number) => {
        page.loadMoreCalls.push(numItems);
      },
    };
  },
}));

beforeEach(() => {
  state.householdId = "household-1";
  for (const page of Object.values(state.pages)) {
    page.results = [];
    page.status = "CanLoadMore";
    page.loadMoreCalls = [];
  }
  state.queries = [];
});

const list = () => renderHook(() => usePlanningList());

const mealIdsOf = (rows: PlanningRow<MealCard>[]) =>
  rows.flatMap((row) => (row.kind === "meal" ? [row.meal.id] : []));

describe("usePlanningList", () => {
  /**
   * `before` arrives newest first — only a reversal puts three-back above yesterday. The meal ids
   * reach the rows through the real `keptMealCardOf` and `buildRows`, so a shape drift between the
   * server's cards and the model's projection fails here and not on a user's screen.
   */
  it("hands the model one chronological week: the earlier pages reversed, above the later ones", () => {
    state.pages.before.results = [
      keptMeal("yesterday", -1, "lunch"),
      keptMeal("three-back", -3, "dinner"),
    ];
    state.pages.after.results = [keptMeal("tomorrow", 1, "lunch")];

    const { result } = list();

    expect(mealIdsOf(result.current.rows)).toEqual(["three-back", "yesterday", "tomorrow"]);
    // The list opens on today, not on the oldest plate above it.
    expect(result.current.initialIndex).toBe(2);
  });

  it("asks both cursors for the focus day, each in its own direction", () => {
    renderHook(() => usePlanningList("2030-05-04"));

    // Per render, not in total: settling `isUnplanned` on the first answer renders the hook twice.
    const lastRender = state.queries.slice(-2);
    expect(state.queries.length % 2).toBe(0);
    expect(lastRender.map((query) => query.direction)).toEqual(["before", "after"]);

    for (const query of state.queries) {
      expect(query.name).toContain("getPaginated");
      expect(query.args).toMatchObject({
        householdId: "household-1",
        locale: "fr",
        from: new Date(2030, 4, 4).getTime(),
      });
    }
  });

  /**
   * The list hands `loadOlder` / `loadNewer` to `onStartReached` / `onEndReached` — a scroll must
   * page the cursor it came from, at the same size the first page opened with.
   */
  it("pages the cursor the scroll came from, and only that one", () => {
    const { result } = list();

    act(() => result.current.loadOlder());

    expect(state.pages.before.loadMoreCalls).toEqual([28]);
    expect(state.pages.after.loadMoreCalls).toEqual([]);

    act(() => result.current.loadNewer());

    expect(state.pages.after.loadMoreCalls).toEqual([28]);
  });

  /**
   * A skipped query reports itself as loading, so a user with no household would wait forever if
   * the gate read the statuses alone — it is scoped on `householdId` for exactly that.
   */
  it("does not wait forever when the household is still unknown", () => {
    state.householdId = undefined;

    const { result } = list();

    expect(state.queries).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
  });

  it("loads until both first pages are in, then stops", () => {
    state.pages.before.status = "LoadingFirstPage";
    const { result, rerender } = list();

    expect(result.current.isLoading).toBe(true);

    state.pages.before.status = "CanLoadMore";
    state.pages.after.status = "LoadingFirstPage";
    rerender();

    expect(result.current.isLoading).toBe(true);

    state.pages.after.status = "CanLoadMore";
    rerender();

    expect(result.current.isLoading).toBe(false);
  });
});

describe("usePlanningList — isUnplanned", () => {
  const exhaust = () => {
    state.pages.before.status = "Exhausted";
    state.pages.after.status = "Exhausted";
  };

  it("is unplanned when both cursors ran out on an empty first page", () => {
    exhaust();

    expect(list().result.current.isUnplanned).toBe(true);
  });

  /** A plate from months ago is a household that has planned — the list has something to show. */
  it("is planned when the only plates are behind the focus day", () => {
    exhaust();
    state.pages.before.results = [keptMeal("last-spring", -90, "dinner")];

    expect(list().result.current.isUnplanned).toBe(false);
  });

  /** An empty first page that can load more has not answered yet whether anything exists. */
  it("is not unplanned while a cursor could still find a plate", () => {
    state.pages.before.status = "Exhausted";

    expect(list().result.current.isUnplanned).toBe(false);
  });

  it("does not decide before the first pages are in", () => {
    state.pages.before.status = "LoadingFirstPage";
    state.pages.after.status = "LoadingFirstPage";

    expect(list().result.current.isUnplanned).toBe(false);
  });

  /**
   * Clearing the last plate while reading the list must leave the cook on it: the redirect answers
   * what the page opened on, not what it holds now.
   */
  it("keeps the answer it opened on when the last plate is cleared", () => {
    exhaust();
    state.pages.after.results = [keptMeal("tomorrow", 1, "lunch")];
    const { result, rerender } = list();

    state.pages.after.results = [];
    rerender();

    expect(result.current.isUnplanned).toBe(false);
  });

  it("stays unplanned for the mount once it opened that way", () => {
    exhaust();
    const { result, rerender } = list();

    state.pages.after.results = [keptMeal("tomorrow", 1, "lunch")];
    rerender();

    expect(result.current.isUnplanned).toBe(true);
  });
});
