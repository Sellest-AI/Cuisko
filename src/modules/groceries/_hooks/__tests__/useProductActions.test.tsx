import { act, renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetHouseholdAtoms } from "~/modules/households/household-atom";

import { useGhosts } from "../useGhosts";
import { useProductActions } from "../useProductActions";

const state = vi.hoisted(() => ({
  householdId: "household-1" as string | undefined,
  calls: [] as { name: string; args: Record<string, unknown> }[],
  rejectNext: false,
  /** Holds the next write open until `release`, for what the screen shows during the wait. */
  holdNext: false,
  release: undefined as (() => void) | undefined,
}));

vi.mock("~/modules/households/hooks", () => ({
  useHousehold: () => ({ householdId: state.householdId, isLoading: false }),
}));

vi.mock("~/lib/convex/client", () => ({
  useMutation: (fn: unknown) => {
    const name = getFunctionName(fn as Parameters<typeof getFunctionName>[0]);

    return {
      mutate: (args: Record<string, unknown>) => {
        state.calls.push({ name, args });

        if (state.rejectNext) {
          state.rejectNext = false;
          return Promise.reject(new Error("write rejected"));
        }

        if (state.holdNext) {
          state.holdNext = false;
          return new Promise<void>((resolve) => { state.release = resolve; });
        }

        return Promise.resolve();
      },
    };
  },
}));

const render = (store = createStore()) =>
  renderHook(
    () => ({
      actions: useProductActions(),
      ghosts: useGhosts().pending,
    }),
    { wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider> },
  );

beforeEach(() => {
  state.householdId = "household-1";
  state.calls = [];
  state.rejectNext = false;
  state.holdNext = false;
  state.release = undefined;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("useProductActions.add", () => {
  it("holds a ghost up until the write lands, then takes it down", async () => {
    state.holdNext = true;
    const { result } = render();

    let adding: Promise<void>;
    act(() => {
      adding = result.current.actions.add("shampoo", null, 2);
    });

    expect(result.current.ghosts).toMatchObject([{ name: "shampoo", amount: 2, intent: "relist", state: "resolving" }]);

    await act(async () => {
      state.release?.();
      await adding;
    });

    expect(result.current.ghosts).toEqual([]);
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0]!.name).toContain("addGroceryProduct");
  });

  it("turns the ghost into the failed card when the write is rejected", async () => {
    state.rejectNext = true;
    const { result } = render();

    await act(() => result.current.actions.add("shampoo", null, null));

    expect(result.current.ghosts).toMatchObject([{ name: "shampoo", state: "failed", reason: "error" }]);
  });

  it("fails the ghost rather than dropping the word when there is no household", async () => {
    state.householdId = undefined;
    const { result } = render();

    await act(() => result.current.actions.add("shampoo", null, null));

    expect(result.current.ghosts).toMatchObject([{ state: "failed", reason: "error" }]);
    expect(state.calls).toEqual([]);
  });

  /** `pickQuantity` would have stored 1 here: it takes the fallback when either half is missing. */
  it.each([
    ["an amount with no unit is that many pieces", null, 2, { unit: "pcs", quantity: 2 }],
    ["an amount and a unit are kept", "l", 2, { unit: "l", quantity: 2 }],
    ["a unit with no amount is one of it", "l", null, { unit: "l", quantity: 1 }],
    ["nothing typed is one piece", null, null, { unit: "pcs", quantity: 1 }],
  ] as const)("%s", async (_label, unit, amount, expected) => {
    const { result } = render();

    await act(() => result.current.actions.add("laundry detergent", unit, amount));

    expect(state.calls[0]!.args).toEqual({ householdId: "household-1", name: "laundry detergent", ...expected });
  });

  it("does nothing for blank text", async () => {
    const { result } = render();

    await act(() => result.current.actions.add("   ", null, null));

    expect(result.current.ghosts).toEqual([]);
    expect(state.calls).toEqual([]);
  });
});

describe("a household switch", () => {
  it("empties the ghosts", async () => {
    const store = createStore();
    const { result } = render(store);

    state.rejectNext = true;
    await act(() => result.current.actions.add("shampoo", null, null));

    expect(result.current.ghosts).toHaveLength(1);

    act(() => resetHouseholdAtoms(store));

    expect(result.current.ghosts).toEqual([]);
  });
});
