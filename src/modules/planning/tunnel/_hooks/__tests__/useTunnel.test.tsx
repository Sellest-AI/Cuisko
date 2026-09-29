import { act, renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { router } from "expo-router";
import { Provider, createStore } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { daysAtom, planAfterAtom, resetTunnelAtom } from "../../../_hooks/atoms";
import { dayOffset } from "../../../_hooks/__tests__/fixtures";
import { routeFor, TUNNEL_STEPS, useTunnel } from "../useTunnel";

/**
 * The seam `_model/model.test.ts` cannot reach: that the week's start is seeded once per run from
 * the household's latest kept plate, and that the reactive query underneath cannot move it after.
 *
 * Convex is mocked at `~/lib/convex/client`. `getLastDate` answers from `state.lastDate`, with
 * `undefined` standing for a round trip still out and `state.failLastDate` for one that failed;
 * the planning seed answers nothing, so no other seeding fires. The router is mocked at
 * `expo-router`, which is the whole of the hook's reach into navigation.
 */
const state = vi.hoisted(() => ({
  lastDate: undefined as number | null | undefined,
  failLastDate: false,
  pathname: "/planning/new/time",
}));

vi.mock("expo-router", () => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), dismissTo: vi.fn(), canGoBack: () => false },
  usePathname: () => state.pathname,
}));

vi.mock("~/modules/households/hooks", () => ({
  useHousehold: () => ({ householdId: "household-1", isLoading: false }),
}));

vi.mock("~/lib/convex/client", () => ({
  useMutation: () => ({ mutate: vi.fn() }),
  useQueryCached: (fn: unknown, args: unknown) => {
    if (args === "skip") return { data: undefined, isPending: true, isError: false };

    const name = getFunctionName(fn as Parameters<typeof getFunctionName>[0]);

    if (name.includes("getPlanningSeed")) return { data: undefined, isPending: true, isError: false };

    if (name.includes("getLastDate")) {
      if (state.failLastDate) return { data: undefined, isPending: false, isError: true };

      return { data: state.lastDate, isPending: state.lastDate === undefined, isError: false };
    }

    throw new Error(`Unmocked query: ${name}`);
  },
}));

let store: ReturnType<typeof createStore>;

beforeEach(() => {
  state.lastDate = undefined;
  state.failLastDate = false;
  state.pathname = "/planning/new/time";
  vi.mocked(router.push).mockClear();
  store = createStore();
  store.set(daysAtom, 3);
});

const tunnel = () =>
  renderHook(() => useTunnel(), {
    wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>,
  });

const asked = (result: { current: ReturnType<typeof useTunnel> }) =>
  result.current.dates.map((date) => date.getTime());

describe("useTunnel — where the week starts", () => {
  it("has no days until the household's latest plate is known", () => {
    const { result } = tunnel();

    expect(result.current.dates).toEqual([]);
  });

  it("starts tomorrow for a household that has never kept a plate", () => {
    state.lastDate = null;

    const { result } = tunnel();

    expect(asked(result)).toEqual([dayOffset(1), dayOffset(2), dayOffset(3)]);
  });

  it("continues the week already kept: the first day is the one after the latest plate", () => {
    state.lastDate = dayOffset(4);

    const { result } = tunnel();

    expect(asked(result)).toEqual([dayOffset(5), dayOffset(6), dayOffset(7)]);
  });

  it("starts tomorrow when the latest plate is already behind the household", () => {
    state.lastDate = dayOffset(-2);

    const { result } = tunnel();

    expect(asked(result)).toEqual([dayOffset(1), dayOffset(2), dayOffset(3)]);
  });

  /** A read that failed is not a week that waits forever: it starts tomorrow, and `commit` holds the rule server-side. */
  it("starts tomorrow when the latest plate could not be read", () => {
    state.failLastDate = true;

    const { result } = tunnel();

    expect(asked(result)).toEqual([dayOffset(1), dayOffset(2), dayOffset(3)]);
  });

  /** A plate kept from another device mid-review must not reshuffle the week under the user. */
  it("seeds the start once per run, whatever the query says later", () => {
    state.lastDate = dayOffset(2);

    const { result, rerender } = tunnel();
    expect(asked(result)).toEqual([dayOffset(3), dayOffset(4), dayOffset(5)]);

    state.lastDate = dayOffset(6);
    act(() => rerender());

    expect(asked(result)).toEqual([dayOffset(3), dayOffset(4), dayOffset(5)]);
  });

  it("re-reads the start on the next run, once the tunnel is reset", () => {
    state.lastDate = dayOffset(2);

    const { result, rerender } = tunnel();
    expect(asked(result)).toEqual([dayOffset(3), dayOffset(4), dayOffset(5)]);

    state.lastDate = dayOffset(6);
    act(() => store.set(resetTunnelAtom));
    act(() => rerender());

    expect(store.get(planAfterAtom)).toEqual(new Date(dayOffset(6)));
    expect(asked(result)).toEqual([dayOffset(7), dayOffset(8), dayOffset(9)]);
  });
});

/**
 * Every link into the tunnel points at its root, and the root draws the first step in place rather
 * than redirecting to it. So the root must *be* step one — read off the path, it matches no step's
 * name, and a hook that fell back to step one there was right only while nobody reordered.
 */
describe("useTunnel — the root is the first step", () => {
  it("routes the first step to the tunnel's root, and every other step below it", () => {
    expect(routeFor(TUNNEL_STEPS[0]!)).toBe("/planning/new");
    expect(routeFor(TUNNEL_STEPS[1]!)).toBe(`/planning/new/${TUNNEL_STEPS[1]}`);
  });

  it("reads the root as step one, and moves on from it to step two", () => {
    state.pathname = "/planning/new";

    const { result } = tunnel();
    expect(result.current.step).toBe(1);

    act(() => result.current.next());

    expect(router.push).toHaveBeenCalledWith(routeFor(TUNNEL_STEPS[1]!));
  });
});
