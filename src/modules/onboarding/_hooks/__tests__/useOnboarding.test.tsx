import { act, renderHook } from "@testing-library/react";
import { Provider } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { isOnboardingSeen } from "../../seen";
import { useOnboarding } from "../useOnboarding";

/** Where the onboarding ends. */
const state = vi.hoisted(() => ({ calls: [] as unknown[][] }));

vi.mock("expo-router", () => {
  const navigation = { reset: (to: unknown) => state.calls.push(["reset", to]) };
  return {
    usePathname: () => "/onboarding/week",
    useNavigationContainerRef: () => navigation,
    router: { push: (path: unknown) => state.calls.push(["push", path]) },
  };
});

beforeEach(() => {
  state.calls = [];
  localStorage.clear();
});

describe("useOnboarding finish", () => {
  it("ends on the sign-in with nothing under it, and the device remembers it was walked", () => {
    const { result } = renderHook(() => useOnboarding(), { wrapper: Provider });
    expect(isOnboardingSeen()).toBe(false);

    act(() => result.current.finish());

    expect(state.calls).toEqual([["reset", { index: 0, routes: [{ name: "auth" }] }]]);
    expect(isOnboardingSeen()).toBe(true);
  });
});
