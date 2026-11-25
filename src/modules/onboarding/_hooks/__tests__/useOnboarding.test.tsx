import { act, renderHook } from "@testing-library/react";
import { Provider } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useOnboarding } from "../useOnboarding";

/** Where the onboarding ends: on the recipe that asked for the sign-in, or on the assistant. */
const state = vi.hoisted(() => ({
  returnPath: undefined as string | undefined,
  calls: [] as unknown[][],
}));

vi.mock("~/modules/auth/hooks", () => ({
  useTakeReturnPath: () => () => {
    const path = state.returnPath;
    state.returnPath = undefined;
    return path;
  },
}));

vi.mock("expo-router", () => {
  const navigation = { reset: (to: unknown) => state.calls.push(["reset", to]) };
  return {
    usePathname: () => "/onboarding/week",
    useNavigationContainerRef: () => navigation,
    router: { push: (path: unknown) => state.calls.push(["push", path]) },
  };
});

const HOME_AND_ASSISTANT = {
  index: 1,
  routes: [{ name: "index" }, { name: "(modals)", params: { screen: "assistant" } }],
};

beforeEach(() => {
  state.returnPath = undefined;
  state.calls = [];
});

describe("useOnboarding finish", () => {
  /** One navigation: a reset then a push showed home between the two. */
  it("ends on the recipe that was held, over home, in one navigation", () => {
    state.returnPath = "/recipe/k57abc/ingredients";
    const { result } = renderHook(() => useOnboarding(), { wrapper: Provider });

    act(() => result.current.finish());

    expect(state.calls).toEqual([
      [
        "reset",
        {
          index: 1,
          routes: [
            { name: "index" },
            { name: "recipe/[id]", params: { id: "k57abc", screen: "ingredients", params: { id: "k57abc" } } },
          ],
        },
      ],
    ]);
  });

  it("ends on the assistant over home when none was", () => {
    const { result } = renderHook(() => useOnboarding(), { wrapper: Provider });

    act(() => result.current.finish());

    expect(state.calls).toEqual([["reset", HOME_AND_ASSISTANT]]);
  });

  it("returns to the recipe once", () => {
    state.returnPath = "/recipe/k57abc";
    const { result } = renderHook(() => useOnboarding(), { wrapper: Provider });

    act(() => result.current.finish());
    act(() => result.current.finish());

    expect(state.calls.at(-1)).toEqual(["reset", HOME_AND_ASSISTANT]);
  });
});
