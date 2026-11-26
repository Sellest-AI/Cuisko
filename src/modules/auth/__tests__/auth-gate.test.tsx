import { render } from "@testing-library/react";
import { makeFunctionReference } from "convex/server";
import { getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { deviceKey, readDevice, writeDevice } from "~/lib/convex/deviceCache";

import { isOnboardingSeen, markOnboardingSeen } from "~/modules/onboarding/seen";

import { returnPathAtom } from "../_hooks/atoms";
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
  push: vi.fn(),
  hide: vi.fn(),
}));

vi.mock("../_hooks/useAuth", () => ({ useAuth: () => state.auth }));

vi.mock("expo-router", () => {
  const navigation = { isReady: () => state.isReady, reset: state.reset };
  return {
    usePathname: () => state.pathname,
    useNavigationContainerRef: () => navigation,
    router: { replace: state.replace, push: state.push },
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
  state.push.mockReset();
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

  describe("on a recipe a shared link opened", () => {
    it("leaves a signed-out person there, uncovered, and lifts the splash", () => {
      state.pathname = "/recipe/k57abc/ingredients";

      const view = render(<AuthGate />);

      expect(state.reset).not.toHaveBeenCalled();
      expect(state.replace).not.toHaveBeenCalled();
      expect(state.hide).toHaveBeenCalledOnce();
      expect(view.container).toBeEmptyDOMElement();
    });

    it("leaves a recipe opened after a sign-in that landed elsewhere", () => {
      state.pathname = "/recipe/k57abc";
      const view = render(<AuthGate />);

      state.pathname = "/";
      state.auth = SIGNING_IN;
      view.rerender(<AuthGate />);
      state.auth = SIGNED_IN;
      view.rerender(<AuthGate />);
      state.pathname = "/recipe/k57abc";
      view.rerender(<AuthGate />);

      expect(state.reset).not.toHaveBeenCalled();
    });

    it("leaves a stored session there through its confirmation", () => {
      state.pathname = "/recipe/k57abc";
      state.auth = STORED_SESSION;
      const view = render(<AuthGate />);

      state.auth = SIGNED_IN;
      view.rerender(<AuthGate />);

      expect(state.reset).not.toHaveBeenCalled();
      expect(state.hide).toHaveBeenCalledOnce();
    });
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

  it("leaves a signed-in person where they are and lifts the splash", () => {
    state.auth = SIGNED_IN;
    state.pathname = "/groceries";

    render(<AuthGate />);

    expect(state.reset).not.toHaveBeenCalled();
    expect(state.replace).not.toHaveBeenCalled();
    expect(state.hide).toHaveBeenCalledOnce();
  });

  describe("on a device that never walked the onboarding", () => {
    it("keeps the splash up until a signed-out person is on the first step", () => {
      const view = render(<AuthGate />);
      expect(state.hide).not.toHaveBeenCalled();

      state.pathname = "/onboarding/promise";
      view.rerender(<AuthGate />);

      expect(state.reset).toHaveBeenCalledOnce();
      expect(state.hide).toHaveBeenCalledOnce();
    });

    /** A deep link is no way around it, except a recipe's (`isGuestPath`). */
    it.each(["/", "/groceries", "/recipe/new", "/recipe/edit/k57abc", "/recipe/step-by-step/k57abc"])(
      "sends a signed-out person on %s to the onboarding",
      (pathname) => {
        state.pathname = pathname;

        render(<AuthGate />);

        expect(state.reset).toHaveBeenCalledExactlyOnceWith(onlyScreen("onboarding"));
        expect(state.hide).not.toHaveBeenCalled();
      },
    );

    it.each(["/onboarding/promise", "/onboarding/week", "/auth"])("leaves a signed-out person on %s", (pathname) => {
      state.pathname = pathname;

      const view = render(<AuthGate />);

      expect(state.reset).not.toHaveBeenCalled();
      expect(state.hide).toHaveBeenCalledOnce();
      expect(view.container).toBeEmptyDOMElement();
    });

    /** The Explore page is open to a guest on the same terms as home: past the onboarding only. */
    it("sends a signed-out person on /explore to the onboarding", () => {
      state.pathname = "/explore";

      render(<AuthGate />);

      expect(state.reset).toHaveBeenCalledExactlyOnceWith(onlyScreen("onboarding"));
    });

    /** The first frame of a cold start: one screen of history, so replacing it is the same reset. */
    it("replaces instead of resetting while the navigator is not ready", () => {
      state.isReady = false;

      render(<AuthGate />);

      expect(state.reset).not.toHaveBeenCalled();
      expect(state.replace).toHaveBeenCalledExactlyOnceWith("/onboarding/promise");
    });
  });

  describe("on a device that is done with the onboarding", () => {
    /** Home is open signed out: what needs an account there asks for it when tapped. */
    it.each(["/", "/auth", "/onboarding/promise"])("leaves a signed-out person on %s, uncovered, and lifts the splash", (pathname) => {
      markOnboardingSeen();
      state.pathname = pathname;

      const view = render(<AuthGate />);

      expect(state.reset).not.toHaveBeenCalled();
      expect(state.replace).not.toHaveBeenCalled();
      expect(state.hide).toHaveBeenCalledOnce();
      expect(view.container).toBeEmptyDOMElement();
    });

    it.each(["/groceries", "/recipe/new", "/recipe/edit/k57abc", "/recipe/step-by-step/k57abc"])(
      "sends a signed-out person on %s home, and keeps the splash up until they are there",
      (pathname) => {
        markOnboardingSeen();
        state.pathname = pathname;

        const view = render(<AuthGate />);

        expect(state.reset).toHaveBeenCalledExactlyOnceWith(onlyScreen("index"));
        expect(state.hide).not.toHaveBeenCalled();

        state.pathname = "/";
        view.rerender(<AuthGate />);

        expect(state.hide).toHaveBeenCalledOnce();
      },
    );

    /** The catalog to browse, like home: what needs an account there asks for it when tapped. */
    it("leaves a signed-out person on /explore, uncovered, and lifts the splash", () => {
      markOnboardingSeen();
      state.pathname = "/explore";

      const view = render(<AuthGate />);

      expect(state.reset).not.toHaveBeenCalled();
      expect(state.replace).not.toHaveBeenCalled();
      expect(state.hide).toHaveBeenCalledOnce();
      expect(view.container).toBeEmptyDOMElement();
    });

    it("replaces by home while the navigator is not ready", () => {
      markOnboardingSeen();
      state.pathname = "/groceries";
      state.isReady = false;

      render(<AuthGate />);

      expect(state.reset).not.toHaveBeenCalled();
      expect(state.replace).toHaveBeenCalledExactlyOnceWith("/");
    });

    /** The cooks signed in from before the flag existed, too: signed out, they stay home. */
    it.each([["confirmed", SIGNED_IN], ["stored", STORED_SESSION]])("is one a %s session was on", (_, auth) => {
      state.auth = auth;
      const view = render(<AuthGate />);
      expect(isOnboardingSeen()).toBe(true);

      state.auth = SIGNED_OUT;
      view.rerender(<AuthGate />);

      expect(state.reset).not.toHaveBeenCalled();
    });
  });

  describe("when a sign-in lands", () => {

    beforeEach(() => getDefaultStore().set(returnPathAtom, undefined));

    /** The onboarding too: someone who went back to it from /auth while their sign-in was in flight. */
    it.each(["/auth", "/onboarding/promise"])("goes from %s home, with nothing over or under it", (pathname) => {
      state.pathname = pathname;
      state.auth = ROW_ARRIVING;
      const view = render(<AuthGate />);
      expect(state.reset).not.toHaveBeenCalled();

      state.auth = SIGNED_IN;
      view.rerender(<AuthGate />);

      expect(state.reset).toHaveBeenCalledExactlyOnceWith(onlyScreen("index"));
    });

    /** One navigation: a reset then a push showed home between the two. */
    it("goes to the recipe that was held, over home, once", () => {
      getDefaultStore().set(returnPathAtom, "/recipe/k57abc/ingredients");
      state.pathname = "/auth";
      state.auth = SIGNED_IN;

      render(<AuthGate />);

      expect(state.reset).toHaveBeenCalledExactlyOnceWith({
        index: 1,
        routes: [
          { name: "index" },
          { name: "recipe/[id]", params: { id: "k57abc", screen: "ingredients", params: { id: "k57abc" } } },
        ],
      });
      expect(getDefaultStore().get(returnPathAtom)).toBeUndefined();
    });

    /** Any page but a recipe has no route to rebuild: home draws first, then the page is pushed over it. */
    it("goes home, then to the page that was held when it is not a recipe", () => {
      vi.useFakeTimers();
      getDefaultStore().set(returnPathAtom, "/explore");
      state.pathname = "/auth";
      state.auth = SIGNED_IN;

      const view = render(<AuthGate />);
      state.pathname = "/";
      view.rerender(<AuthGate />);

      expect(state.reset).toHaveBeenCalledExactlyOnceWith(onlyScreen("index"));
      expect(state.push).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(state.push).toHaveBeenCalledExactlyOnceWith("/explore");
      expect(getDefaultStore().get(returnPathAtom)).toBeUndefined();
      vi.useRealTimers();
    });

    /** Forgotten too, or the next sign-in on this phone would open it. */
    it("leaves the recipe its person went back to, and stops holding it", () => {
      getDefaultStore().set(returnPathAtom, "/recipe/k57abc");
      state.pathname = "/recipe/k57abc";
      const view = render(<AuthGate />);

      state.auth = SIGNING_IN;
      view.rerender(<AuthGate />);
      state.auth = SIGNED_IN;
      view.rerender(<AuthGate />);

      expect(state.reset).not.toHaveBeenCalled();
      expect(getDefaultStore().get(returnPathAtom)).toBeUndefined();
    });
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
    it("sends home and clears the device once the session is gone", () => {
      writeDevice(deviceKey(getMe, {}), { data: { name: "Camille" } });
      state.pathname = "/groceries";
      state.auth = STORED_SESSION;
      const view = render(<AuthGate />);

      state.auth = SIGNED_OUT;
      view.rerender(<AuthGate />);

      expect(state.reset).toHaveBeenCalledExactlyOnceWith(onlyScreen("index"));
      expect(readDevice(deviceKey(getMe, {}))).toBeUndefined();
    });
  });
});
