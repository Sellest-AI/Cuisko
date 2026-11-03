import { act, renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useStrikeProduct } from "../useStrikeProduct";

const state = vi.hoisted(() => ({
  householdId: "household-1" as string | undefined,
  calls: [] as { name: string; args: Record<string, unknown> }[],
  rejectNext: false,
  isLoading: false,
}));

vi.mock("~/modules/households/hooks", () => ({
  useHousehold: () => ({ householdId: state.householdId, isLoading: false }),
}));

vi.mock("~/lib/convex/client", () => ({
  useMutation: (fn: unknown) => {
    const name = getFunctionName(fn as Parameters<typeof getFunctionName>[0]);

    return {
      isLoading: state.isLoading,
      mutate: (args: Record<string, unknown>) => {
        state.calls.push({ name, args });

        if (state.rejectNext) {
          state.rejectNext = false;
          return Promise.reject(new Error("write rejected"));
        }

        return Promise.resolve();
      },
    };
  },
}));

const render = () => renderHook(() => useStrikeProduct());

beforeEach(() => {
  state.householdId = "household-1";
  state.calls = [];
  state.rejectNext = false;
  state.isLoading = false;
});

describe("useStrikeProduct", () => {
  it("removes the row it is handed, in the current household", async () => {
    const { result } = render();

    await act(() => result.current.strike("shampoo"));

    expect(state.calls).toHaveLength(1);
    expect(state.calls[0]!.name).toContain("removeGroceryProduct");
    expect(state.calls[0]!.args).toEqual({ householdId: "household-1", productId: "shampoo" });
  });

  it("says the card is busy for as long as the write is", () => {
    state.isLoading = true;

    expect(render().result.current.isStriking).toBe(true);
  });

  /** The grid does not await this, so a rejection escaping it would be an unhandled one. */
  it("logs a rejected write and does not throw", async () => {
    state.rejectNext = true;
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = render();

    await act(() => expect(result.current.strike("shampoo")).resolves.toBeUndefined());

    expect(logged).toHaveBeenCalled();
  });

  it("writes nothing with no household", async () => {
    state.householdId = undefined;
    const { result } = render();

    await act(() => result.current.strike("shampoo"));

    expect(state.calls).toEqual([]);
  });
});
