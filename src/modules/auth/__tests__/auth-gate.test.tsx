import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthGate } from "../auth-gate";

/**
 * The gate against the auth states it has to tell apart. `useAuth` and the router are faked: what
 * is under test is where each state sends the person, that nothing is left behind them to swipe
 * back to, and whether the splash may lift yet.
 */
const state = vi.hoisted(() => ({
  auth: { isAuthenticated: false, isLoading: false },
  pathname: "/",
  isReady: true,
  reset: vi.fn(),
  replace: vi.fn(),
  hide: vi.fn(),
}));

vi.mock("../_hooks/useAuth", () => ({ useAuth: () => state.auth }));

vi.mock("expo-router", () => {
  const navigation = { isReady: () => state.isReady, reset: state.reset };
  return {
    usePathname: () => state.pathname,
    useNavigationContainerRef: () => navigation,
    router: { replace: state.replace },
  };
});

vi.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: () => Promise.resolve(true),
  hide: state.hide,
}));

/** The root stack reduced to one screen: nothing to swipe back to. */
const onlyScreen = (name: string) => ({ index: 0, routes: [{ name }] });

beforeEach(() => {
  state.auth = { isAuthenticated: false, isLoading: false };
  state.pathname = "/";
  state.isReady = true;
  state.reset.mockReset();
  state.replace.mockReset();
  state.hide.mockReset();
});

describe("AuthGate", () => {
  /** The splash lifting before the profile lands is what this gate exists to prevent. */
  it("holds the splash and decides nothing while auth or the profile is loading", () => {
    state.auth = { isAuthenticated: true, isLoading: true };

    render(<AuthGate />);

    expect(state.reset).not.toHaveBeenCalled();
    expect(state.replace).not.toHaveBeenCalled();
    expect(state.hide).not.toHaveBeenCalled();
  });

  it("sends a signed-out person to /auth, and keeps the splash up until they are there", () => {
    const view = render(<AuthGate />);

    expect(state.reset).toHaveBeenCalledExactlyOnceWith(onlyScreen("auth"));
    expect(state.hide).not.toHaveBeenCalled();

    state.pathname = "/auth";
    view.rerender(<AuthGate />);

    expect(state.hide).toHaveBeenCalledOnce();
  });

  /** A deep link is no way around it. */
  it("sends a signed-out person to /auth from any route", () => {
    state.pathname = "/groceries";

    render(<AuthGate />);

    expect(state.reset).toHaveBeenCalledExactlyOnceWith(onlyScreen("auth"));
  });

  /**
   * Every sign-in walks the onboarding, a reinstall and a sign-out included, and must not leave
   * /auth under it, where a swipe back would find it.
   */
  it("clears the history when a signed-in person leaves /auth for the onboarding", () => {
    state.pathname = "/auth";
    const view = render(<AuthGate />);

    state.auth = { isAuthenticated: true, isLoading: true };
    view.rerender(<AuthGate />);
    expect(state.reset).not.toHaveBeenCalled();

    state.auth = { isAuthenticated: true, isLoading: false };
    view.rerender(<AuthGate />);
    expect(state.reset).toHaveBeenCalledExactlyOnceWith(onlyScreen("onboarding"));
  });

  /** The last step resets to home and the assistant itself; the gate must not race it. */
  it("leaves a signed-in person on the onboarding", () => {
    state.auth = { isAuthenticated: true, isLoading: false };
    state.pathname = "/onboarding/week";

    render(<AuthGate />);

    expect(state.reset).not.toHaveBeenCalled();
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("sends a signed-out person on the onboarding to /auth", () => {
    state.pathname = "/onboarding/promise";

    render(<AuthGate />);

    expect(state.reset).toHaveBeenCalledExactlyOnceWith(onlyScreen("auth"));
  });

  /** `/auth` draws its own spinners mid sign-in; a cover over them blanked the page, then gave it back. */
  it("draws no cover over /auth while a sign-in resolves", () => {
    state.pathname = "/auth";
    state.auth = { isAuthenticated: false, isLoading: true };

    expect(render(<AuthGate />).container).toBeEmptyDOMElement();
  });

  it("covers any other page while auth resolves", () => {
    state.auth = { isAuthenticated: true, isLoading: true };

    expect(render(<AuthGate />).container).not.toBeEmptyDOMElement();
  });

  /** The first frame of a cold start: one screen of history, so replacing it is the same reset. */
  it("replaces instead of resetting while the navigator is not ready", () => {
    state.isReady = false;

    render(<AuthGate />);

    expect(state.reset).not.toHaveBeenCalled();
    expect(state.replace).toHaveBeenCalledExactlyOnceWith("/auth");
  });

  it("leaves a signed-in person where they are and lifts the splash", () => {
    state.auth = { isAuthenticated: true, isLoading: false };
    state.pathname = "/groceries";

    render(<AuthGate />);

    expect(state.reset).not.toHaveBeenCalled();
    expect(state.replace).not.toHaveBeenCalled();
    expect(state.hide).toHaveBeenCalledOnce();
  });
});
