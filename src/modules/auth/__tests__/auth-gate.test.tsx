import { render } from "@testing-library/react";
import { makeFunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { deviceKey, readDevice, writeDevice } from "~/lib/convex/deviceCache";

import { AuthGate } from "../auth-gate";

/** The states `useAuth` passes through, with every field the gate reads. */
const SIGNED_OUT = { isAuthenticated: false, isAuthenticating: false, hasSession: false, isLoading: false };
const SIGNED_IN = { isAuthenticated: true, isAuthenticating: false, hasSession: true, isLoading: false };
/** Confirmed, the cook's row not there yet. */
const ROW_ARRIVING = { ...SIGNED_IN, isLoading: true };
/** A sign-in started on `/auth`, its token not landed. */
const SIGNING_IN = { ...SIGNED_OUT, isAuthenticating: true, isLoading: true };
/** A stored token Convex has not confirmed (offline, or the first beats of a cold start), the cook on the device. */
const STORED_SESSION = { isAuthenticated: false, isAuthenticating: true, hasSession: true, isLoading: false };

/**
 * The gate against the auth states it has to tell apart. `useAuth` and the router are faked: what
 * is under test is where each state sends the person, that nothing is left behind them to swipe
 * back to, and whether the splash may lift yet.
 */
const state = vi.hoisted(() => ({
  auth: {} as Record<string, boolean>,
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
  setOptions: () => undefined,
  hide: state.hide,
}));

/** The root stack reduced to one screen: nothing to swipe back to. */
const onlyScreen = (name: string) => ({ index: 0, routes: [{ name }] });

beforeEach(() => {
  state.auth = SIGNED_OUT;
  localStorage.clear();
  state.pathname = "/";
  state.isReady = true;
  state.reset.mockReset();
  state.replace.mockReset();
  state.hide.mockReset();
});

describe("AuthGate", () => {
  /** The splash lifting before the profile lands is what this gate exists to prevent. */
  it("holds the splash and decides nothing while auth or the profile is loading", () => {
    state.auth = ROW_ARRIVING;

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

    state.auth = ROW_ARRIVING;
    view.rerender(<AuthGate />);
    expect(state.reset).not.toHaveBeenCalled();

    state.auth = SIGNED_IN;
    view.rerender(<AuthGate />);
    expect(state.reset).toHaveBeenCalledExactlyOnceWith(onlyScreen("onboarding"));
  });

  /** The last step resets to home and the assistant itself; the gate must not race it. */
  it("leaves a signed-in person on the onboarding", () => {
    state.auth = SIGNED_IN;
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
    state.auth = SIGNING_IN;

    expect(render(<AuthGate />).container).toBeEmptyDOMElement();
  });

  it("covers any other page while auth resolves", () => {
    state.auth = ROW_ARRIVING;

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
    state.auth = SIGNED_IN;
    state.pathname = "/groceries";

    render(<AuthGate />);

    expect(state.reset).not.toHaveBeenCalled();
    expect(state.replace).not.toHaveBeenCalled();
    expect(state.hide).toHaveBeenCalledOnce();
  });

  describe("with a session stored on the device", () => {
    const getMe = makeFunctionReference<"query">("users/getMe:authed");

    /** The cold start this exists for: offline, or before the socket confirms the token. */
    it("lifts the splash on a cook from the device before Convex confirms, and keeps the cache", () => {
      writeDevice(deviceKey(getMe, {}), { data: { name: "Camille" } });
      state.auth = STORED_SESSION;

      const view = render(<AuthGate />);

      expect(state.reset).not.toHaveBeenCalled();
      expect(state.replace).not.toHaveBeenCalled();
      expect(state.hide).toHaveBeenCalledOnce();
      expect(view.container).toBeEmptyDOMElement();
      expect(readDevice(deviceKey(getMe, {}))).toBeDefined();
    });

    it("waits as before when the cook is not on the device yet", () => {
      state.auth = { ...STORED_SESSION, isLoading: true };

      render(<AuthGate />);

      expect(state.reset).not.toHaveBeenCalled();
      expect(state.hide).not.toHaveBeenCalled();
    });

    it("raises no cover when Convex confirms after the device draw", () => {
      state.auth = STORED_SESSION;
      const view = render(<AuthGate />);

      state.auth = SIGNED_IN;
      view.rerender(<AuthGate />);

      expect(view.container).toBeEmptyDOMElement();
      expect(state.reset).not.toHaveBeenCalled();
    });

    /** A refresh failing on a weak network keeps the tokens: the cook stays where they are. */
    it("leaves the screen where it is while a stored session is unconfirmed mid-session", () => {
      state.auth = SIGNED_IN;
      state.pathname = "/groceries";
      const view = render(<AuthGate />);

      state.auth = STORED_SESSION;
      view.rerender(<AuthGate />);

      expect(state.reset).not.toHaveBeenCalled();
    });

    /** The server refused the session, or a cook signed out: the next one finds nothing of them. */
    it("sends to /auth and clears the device once the session is gone", () => {
      writeDevice(deviceKey(getMe, {}), { data: { name: "Camille" } });
      state.auth = STORED_SESSION;
      const view = render(<AuthGate />);

      state.auth = SIGNED_OUT;
      view.rerender(<AuthGate />);

      expect(state.reset).toHaveBeenCalledExactlyOnceWith(onlyScreen("auth"));
      expect(readDevice(deviceKey(getMe, {}))).toBeUndefined();
    });
  });
});
