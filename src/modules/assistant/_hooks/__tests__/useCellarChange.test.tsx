import { act, renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DrawnCellarChange } from "../../_model/chatMessage";
import { useCellarChange } from "../useCellarChange";

/**
 * The chat's cellar card: what its undo sends. Convex is mocked at `~/lib/convex/client`, the one
 * module a `_hooks/` file reaches it by.
 */
const state = vi.hoisted(() => ({
  writes: [] as { name: string; args: Record<string, unknown> }[],
}));

vi.mock("~/hooks/useLocale", () => ({ useLocale: () => "fr" }));
vi.mock("~/hooks/useUnitLabel", () => ({ useUnitLabel: () => (unit: string) => unit }));

vi.mock("~/lib/convex/client", () => ({
  useQuery: (fn: unknown) =>
    getFunctionName(fn as never) === "router/cellars/getCellar:authed"
      ? { status: "success", data: [{ _id: "row-eggs" }] }
      : { status: "success", data: [{ _id: "eggs", name: "Œufs", emoji: "🥚" }] },
  useMutation: (fn: unknown) => ({
    isLoading: false,
    mutate: async (args: Record<string, unknown>) => {
      state.writes.push({ name: getFunctionName(fn as never), args });
    },
  }),
}));

/** Six eggs Cuisko put on the shelf, two of which struck a grocery line. */
const eggs = (action: "add" | "remove"): DrawnCellarChange => ({
  v: 1,
  action,
  householdId: "home",
  lines: [{ ingredientId: "eggs", cellarItemId: "row-eggs", unit: "pcs", quantity: 6, restoreToList: 2 }],
});

/** A store of its own per test, so an undo recorded in one never shows in the next. */
const render = (change: DrawnCellarChange) => {
  const store = createStore();
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  return renderHook(() => useCellarChange(change, "message-1:call-1"), { wrapper });
};

beforeEach(() => {
  state.writes = [];
});

describe("useCellarChange", () => {
  /** The server reports a taken-back purchase only when told: it cannot see the undo button. */
  it("takes an add back as an undo, with what it struck off the list", async () => {
    const { result } = render(eggs("add"));

    await act(() => result.current.undo());

    expect(state.writes).toEqual([
      {
        name: "router/cellars/removeFromCellar:authed",
        args: { householdId: "home", ingredientId: "eggs", unit: "pcs", quantity: 6, restoreToList: 2, isUndo: true },
      },
    ]);
  });

  it("puts a removal back without striking the list", async () => {
    const { result } = render(eggs("remove"));

    await act(() => result.current.undo());

    expect(state.writes).toEqual([
      {
        name: "router/cellars/addToCellar:authed",
        args: { householdId: "home", ingredientId: "eggs", unit: "pcs", quantity: 6, strikeList: false },
      },
    ]);
  });
});
