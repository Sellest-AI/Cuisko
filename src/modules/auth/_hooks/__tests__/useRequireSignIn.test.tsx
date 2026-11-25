import { act, renderHook } from "@testing-library/react";
import { Provider } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useRequireSignIn } from "../useRequireSignIn";
import { useTakeReturnPath } from "../useTakeReturnPath";

const SESSION = { hasSession: true, isAuthenticating: false };
const SIGNED_OUT = { hasSession: false, isAuthenticating: false };
const DECIDING = { hasSession: false, isAuthenticating: true };

const state = vi.hoisted(() => ({
  auth: {} as { hasSession: boolean; isAuthenticating: boolean },
  pathname: "",
  navigate: vi.fn(),
}));

vi.mock("~/lib/convex/auth", () => ({ useAuthenticated: () => state.auth }));
vi.mock("expo-router", () => ({
  usePathname: () => state.pathname,
  router: { navigate: state.navigate },
}));

const asking = () =>
  renderHook(() => ({ ...useRequireSignIn(), take: useTakeReturnPath() }), { wrapper: Provider });

type Asking = ReturnType<typeof asking>["result"];

const take = (result: Asking) => {
  let path: string | undefined;
  act(() => {
    path = result.current.take();
  });
  return path;
};

beforeEach(() => {
  state.auth = SIGNED_OUT;
  state.pathname = "/recipe/k57abc/ingredients";
  state.navigate.mockReset();
});

describe("useRequireSignIn", () => {
  it("runs the action with its arguments when there is a session", () => {
    state.auth = SESSION;
    const action = vi.fn();
    const { result } = asking();

    act(() => result.current.requireSignIn(action)("k57abc", 2));

    expect(action).toHaveBeenCalledExactlyOnceWith("k57abc", 2);
    expect(state.navigate).not.toHaveBeenCalled();
    expect(take(result)).toBeUndefined();
  });

  it("opens /auth instead when signed out, and holds the page once", () => {
    const action = vi.fn();
    const { result } = asking();

    act(() => result.current.requireSignIn(action)());

    expect(result.current.isSignedOut).toBe(true);
    expect(action).not.toHaveBeenCalled();
    expect(state.navigate).toHaveBeenCalledExactlyOnceWith("/auth");
    expect(take(result)).toBe("/recipe/k57abc/ingredients");
    expect(take(result)).toBeUndefined();
  });

  /** The recipe stays mounted under /auth, and reads its path while the push plays. */
  it("keeps the recipe when a second tap lands once /auth is the focused page", () => {
    const { result, rerender } = asking();

    act(() => result.current.signIn());
    state.pathname = "/auth";
    rerender();
    act(() => result.current.signIn());

    expect(take(result)).toBe("/recipe/k57abc/ingredients");
  });

  it("holds the last recipe tapped on, after coming back without signing in", () => {
    const { result, rerender } = asking();

    act(() => result.current.signIn());
    state.pathname = "/recipe/k57other";
    rerender();
    act(() => result.current.signIn());

    expect(take(result)).toBe("/recipe/k57other");
  });

  it("does nothing on a tap while auth is deciding", () => {
    state.auth = DECIDING;
    const action = vi.fn();
    const { result } = asking();

    act(() => result.current.requireSignIn(action)());

    expect(result.current.isSignedOut).toBe(false);
    expect(action).not.toHaveBeenCalled();
    expect(state.navigate).not.toHaveBeenCalled();
    expect(take(result)).toBeUndefined();
  });
});
