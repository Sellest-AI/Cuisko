import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` is hoisted above this by the transform, so the hook still loads against the mocks.
import { useCreateRecipe } from "../useCreateRecipe";

/**
 * The hook's promises: one press is one write, the route changes on success, and a failure hands
 * the cook back their form instead of stranding them under the overlay.
 *
 * Convex is mocked at `~/lib/convex/client`, the one module a `_hooks/` file may reach it through,
 * and the action is left hanging so a test can hold the wait open and act during it. Everything
 * above that line is the real thing — the real state machine.
 */
const state = vi.hoisted(() => ({
  /** How many times the action was actually invoked. The whole point of the guard. */
  calls: 0,
  settle: undefined as { resolve: (id: string) => void; reject: (reason: unknown) => void } | undefined,
  replaced: [] as string[],
}));

vi.mock("expo-router", () => ({
  router: { replace: (href: string) => state.replaced.push(href) },
}));

vi.mock("~/hooks/useLocale", () => ({ useLocale: () => "fr" }));

vi.mock("~/lib/convex/client", () => ({
  useAction: () => ({
    action: () => {
      state.calls += 1;

      return new Promise<string>((resolve, reject) => {
        state.settle = { resolve, reject };
      });
    },
  }),
}));

const DRAFT = { servings: 2, ingredients: "2 onions", instructions: "Cook them." };

beforeEach(() => {
  state.calls = 0;
  state.settle = undefined;
  state.replaced = [];
});

describe("useCreateRecipe", () => {
  it("writes once however many times it is asked while the first write is in flight", async () => {
    const { result } = renderHook(() => useCreateRecipe());

    act(() => void result.current.create(DRAFT));
    await waitFor(() => expect(result.current.isCreating).toBe(true));

    act(() => void result.current.create(DRAFT));
    act(() => void result.current.create(DRAFT));

    /** Three presses, one recipe — and one agent run rather than three. */
    expect(state.calls).toBe(1);
  });

  it("does not latch: a finished write leaves the hook able to run another", async () => {
    const { result } = renderHook(() => useCreateRecipe());

    act(() => void result.current.create(DRAFT));
    await waitFor(() => expect(result.current.isCreating).toBe(true));

    await act(async () => state.settle!.resolve("recipe-1"));

    act(() => void result.current.create(DRAFT));

    expect(state.calls).toBe(2);
  });

  it("replaces the route with the recipe it just wrote", async () => {
    const { result } = renderHook(() => useCreateRecipe());

    act(() => void result.current.create(DRAFT));
    await waitFor(() => expect(result.current.isCreating).toBe(true));
    await act(async () => state.settle!.resolve("recipe-1"));

    /** `replace`, not `push`: Back belongs to the list, not to a form already submitted. */
    expect(state.replaced).toEqual(["/recipe/recipe-1"]);
  });

  /**
   * The overlay covers the editor rather than replacing it, so lifting it is what returns the cook
   * to their own typed text. A failure that left `isCreating` true would strand them under a wait
   * that never finishes.
   */
  it("lifts the wait and surfaces the reason when the write fails", async () => {
    const { result } = renderHook(() => useCreateRecipe());

    act(() => void result.current.create(DRAFT));
    await waitFor(() => expect(result.current.isCreating).toBe(true));

    const failure = new Error("the agent was unreachable");
    await act(async () => state.settle!.reject(failure));

    await waitFor(() => expect(result.current.isCreating).toBe(false));
    expect(result.current.error).toBe(failure);
    expect(state.replaced).toEqual([]);
  });
});
