import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
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

let store = createStore();

/** The hook in this test's own store: the checks are app-wide state, and must not leak between tests. */
const render = (id: string) =>
  renderHook(() => useVerifyRecipe(id), {
    wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>,
  });

beforeEach(() => {
  state.calls = 0;
  state.role = "ADMIN";
  state.settle = undefined;
  store = createStore();
});

describe("useVerifyRecipe", () => {
  it("offers the button to an admin only", () => {
    expect(render("recipe-1").result.current.canVerify).toBe(true);

    state.role = "USER";
    expect(render("recipe-1").result.current.canVerify).toBe(false);
  });

  it("verifies once however many times it is pressed while the first check runs", async () => {
    const { result } = render("recipe-1");

    act(() => void result.current.verify());
    await waitFor(() => expect(result.current.isVerifying).toBe(true));

    act(() => void result.current.verify());

    expect(state.calls).toBe(1);
  });

  it("returns the corrections the server made", async () => {
    const { result } = render("recipe-1");
    const outcome = { verdict: "rewritten", corrections: ["Oil: the frying was missing."] };

    act(() => void result.current.verify());
    await waitFor(() => expect(state.settle).toBeDefined());
    await act(async () => state.settle!.resolve(outcome));

    expect(result.current.outcome).toEqual(outcome);
    expect(result.current.isVerifying).toBe(false);
  });

  it("keeps the error of a check that failed, and no outcome", async () => {
    const { result } = render("recipe-1");
    const failure = new Error("scrape failed");

    act(() => void result.current.verify());
    await waitFor(() => expect(state.settle).toBeDefined());
    await act(async () => state.settle!.reject(failure));

    expect(result.current.error).toBe(failure);
    expect(result.current.outcome).toBeNull();
  });

  it("keeps the answer of a check the screen left before it finished", async () => {
    const leaving = render("recipe-1");
    const outcome = { verdict: "rewritten", corrections: ["Oil: the frying was missing."] };

    act(() => void leaving.result.current.verify());
    await waitFor(() => expect(state.settle).toBeDefined());
    leaving.unmount();
    await act(async () => state.settle!.resolve(outcome));

    expect(render("recipe-1").result.current.outcome).toEqual(outcome);
  });

  it("resumes a running check from when it started, not from when the screen came back", async () => {
    const leaving = render("recipe-1");

    act(() => void leaving.result.current.verify());
    await waitFor(() => expect(leaving.result.current.startedAt).toBeDefined());
    const { startedAt } = leaving.result.current;
    leaving.unmount();

    const back = render("recipe-1").result.current;

    expect(back.isVerifying).toBe(true);
    expect(back.startedAt).toBe(startedAt);
  });

  it("keeps each recipe's check to that recipe", async () => {
    const first = render("recipe-1");

    act(() => void first.result.current.verify());
    await waitFor(() => expect(state.settle).toBeDefined());
    await act(async () => state.settle!.resolve({ verdict: "unchanged" }));

    const other = render("recipe-2").result.current;

    expect(other.outcome).toBeNull();
    expect(other.isVerifying).toBe(false);
  });
});
