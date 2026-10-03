import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` is hoisted above this by the transform, so the hook still loads against the mocks.
import { useVerifyRecipe } from "../useVerifyRecipe";

/** `useUpdateRecipe.test.tsx`'s seam: Convex mocked at `~/lib/convex/client`, the action held open per test. */
const state = vi.hoisted(() => ({
  calls: 0,
  role: "ADMIN" as "ADMIN" | "USER",
  settle: undefined as { resolve: (outcome: unknown) => void; reject: (reason: unknown) => void } | undefined,
}));

vi.mock("~/hooks/useLocale", () => ({ useLocale: () => "fr" }));

vi.mock("~/modules/auth/hooks", () => ({ useAuth: () => ({ user: { role: state.role } }) }));

vi.mock("~/lib/convex/client", () => ({
  useAction: () => ({
    action: () => {
      state.calls += 1;

      return new Promise((resolve, reject) => {
        state.settle = { resolve, reject };
      });
    },
  }),
}));

beforeEach(() => {
  state.calls = 0;
  state.role = "ADMIN";
  state.settle = undefined;
});

describe("useVerifyRecipe", () => {
  it("offers the button to an admin only", () => {
    expect(renderHook(() => useVerifyRecipe("recipe-1")).result.current.canVerify).toBe(true);

    state.role = "USER";
    expect(renderHook(() => useVerifyRecipe("recipe-1")).result.current.canVerify).toBe(false);
  });

  it("verifies once however many times it is pressed while the first check runs", async () => {
    const { result } = renderHook(() => useVerifyRecipe("recipe-1"));

    act(() => void result.current.verify());
    await waitFor(() => expect(result.current.isVerifying).toBe(true));

    act(() => void result.current.verify());

    expect(state.calls).toBe(1);
  });

  it("returns the corrections the server made", async () => {
    const { result } = renderHook(() => useVerifyRecipe("recipe-1"));
    const outcome = { verdict: "rewritten", corrections: ["Oil: the frying was missing."] };

    act(() => void result.current.verify());
    await waitFor(() => expect(state.settle).toBeDefined());
    await act(async () => state.settle!.resolve(outcome));

    expect(result.current.outcome).toEqual(outcome);
    expect(result.current.isVerifying).toBe(false);
  });

  it("keeps the error of a check that failed, and no outcome", async () => {
    const { result } = renderHook(() => useVerifyRecipe("recipe-1"));
    const failure = new Error("scrape failed");

    act(() => void result.current.verify());
    await waitFor(() => expect(state.settle).toBeDefined());
    await act(async () => state.settle!.reject(failure));

    expect(result.current.error).toBe(failure);
    expect(result.current.outcome).toBeNull();
  });
});
