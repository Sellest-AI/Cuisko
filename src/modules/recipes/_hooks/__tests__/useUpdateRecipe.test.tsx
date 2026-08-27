import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "~/lib/convex/api";

// `vi.mock` is hoisted above this by the transform, so the hook still loads against the mocks.
import { useUpdateRecipe } from "../useUpdateRecipe";

/**
 * `useCreateRecipe.test.tsx`'s seam, for the sibling hook. See there for why Convex is mocked at
 * `~/lib/convex/client` and nowhere higher.
 */
const state = vi.hoisted(() => ({
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

const EDIT = {
  recipeId: "recipe-1" as Id<"recipes">,
  title: "Onion soup",
  description: "A winter soup.",
  servings: 2,
  ingredients: "2 onions",
  instructions: "Cook them.",
};

beforeEach(() => {
  state.calls = 0;
  state.settle = undefined;
  state.replaced = [];
});

describe("useUpdateRecipe", () => {
  it("writes once however many times it is asked while the first write is in flight", async () => {
    const { result } = renderHook(() => useUpdateRecipe());

    act(() => void result.current.update(EDIT));
    await waitFor(() => expect(result.current.isUpdating).toBe(true));

    act(() => void result.current.update(EDIT));
    act(() => void result.current.update(EDIT));

    expect(state.calls).toBe(1);
  });

  it("does not latch: a finished write leaves the hook able to run another", async () => {
    const { result } = renderHook(() => useUpdateRecipe());

    act(() => void result.current.update(EDIT));
    await waitFor(() => expect(result.current.isUpdating).toBe(true));

    await act(async () => state.settle!.resolve("recipe-1"));

    act(() => void result.current.update(EDIT));

    expect(state.calls).toBe(2);
  });

  it("replaces the route with the recipe it just rewrote", async () => {
    const { result } = renderHook(() => useUpdateRecipe());

    act(() => void result.current.update(EDIT));
    await waitFor(() => expect(result.current.isUpdating).toBe(true));
    await act(async () => state.settle!.resolve("recipe-1"));

    expect(state.replaced).toEqual(["/recipe/recipe-1"]);
  });

  it("lifts the wait and surfaces the reason when the write fails", async () => {
    const { result } = renderHook(() => useUpdateRecipe());

    act(() => void result.current.update(EDIT));
    await waitFor(() => expect(result.current.isUpdating).toBe(true));

    const failure = new Error("the agent was unreachable");
    await act(async () => state.settle!.reject(failure));

    await waitFor(() => expect(result.current.isUpdating).toBe(false));
    expect(result.current.error).toBe(failure);
    expect(result.current.progress).toBe(0);
    expect(state.replaced).toEqual([]);
  });
});
