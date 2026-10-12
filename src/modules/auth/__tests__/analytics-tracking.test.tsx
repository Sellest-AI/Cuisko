import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AnalyticsTracking } from "../analytics-tracking";

/** Who auth says is signed in; a test changes it, then re-renders. */
const auth = vi.hoisted(() => ({ userId: null as string | null, isDeciding: false }));

/** The route's segments as expo-router reports them; a test navigates by writing here. */
const route = vi.hoisted(() => ({ segments: [] as string[] }));

/** What analytics holds, starting as the device's visitor. One client for every render, as `usePostHog` returns one. */
const analytics = vi.hoisted(() => {
  const state = { distinctId: "visitor", anonymousId: "visitor" };
  return {
    state,
    client: {
      ready: vi.fn(() => Promise.resolve()),
      getDistinctId: vi.fn(() => state.distinctId),
      getAnonymousId: vi.fn(() => state.anonymousId),
      identify: vi.fn((id: string) => {
        state.distinctId = id;
      }),
      reset: vi.fn(() => {
        state.distinctId = "next-visitor";
        state.anonymousId = "next-visitor";
      }),
      /** Records who the screen was attributed to, which is the point of the ordering. */
      screen: vi.fn((_name: string) => Promise.resolve()),
    },
  };
});

vi.mock("../_hooks/useSignedInUserId", () => ({ useSignedInUserId: () => auth }));
vi.mock("expo-router", () => ({ useSegments: () => route.segments }));
vi.mock("posthog-react-native", () => ({ usePostHog: () => analytics.client }));

const { client } = analytics;
const signIn = (id: string) => Object.assign(auth, { userId: id, isDeciding: false });
const signOut = () => Object.assign(auth, { userId: null, isDeciding: false });
/** Lets every pending `ready().then` run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const screens = () => client.screen.mock.calls.map(([name]) => name);

describe("AnalyticsTracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signOut();
    route.segments = [];
    Object.assign(analytics.state, { distinctId: "visitor", anonymousId: "visitor" });
  });

  describe("who", () => {
    it("identifies the cook by their id alone, once, when they sign in", async () => {
      const view = render(<AnalyticsTracking />);
      signIn("camille");
      view.rerender(<AnalyticsTracking />);
      view.rerender(<AnalyticsTracking />);
      await settle();

      expect(client.identify).toHaveBeenCalledWith("camille");
      expect(client.identify).toHaveBeenCalledTimes(1);
      expect(client.reset).not.toHaveBeenCalled();
    });

    it("resets when the cook signs out, so the next one starts as a visitor", async () => {
      signIn("camille");
      const view = render(<AnalyticsTracking />);
      await settle();

      signOut();
      view.rerender(<AnalyticsTracking />);

      await waitFor(() => expect(client.reset).toHaveBeenCalledTimes(1));
    });

    /** A session that expired while the app was closed leaves Hugo held on the next launch. */
    it("resets a cook left over from an earlier session before identifying the one signing in", async () => {
      analytics.state.distinctId = "hugo";
      signIn("camille");
      render(<AnalyticsTracking />);
      await settle();

      expect(client.identify).toHaveBeenCalledWith("camille");
      expect(client.reset.mock.invocationCallOrder[0]).toBeLessThan(client.identify.mock.invocationCallOrder[0]!);
    });

    /** A token being refreshed is not a sign-out. */
    it("waits while auth is still deciding", async () => {
      analytics.state.distinctId = "camille";
      Object.assign(auth, { userId: null, isDeciding: true });
      render(<AnalyticsTracking />);
      await settle();

      expect(client.ready).not.toHaveBeenCalled();
      expect(client.reset).not.toHaveBeenCalled();
    });

    /** Analytics still loading from storage when Camille signs out: her identify must not land after. */
    it("drops a decision made for a cook who has since signed out", async () => {
      let finishLoading = () => {};
      client.ready.mockImplementationOnce(() => new Promise<void>((resolve) => (finishLoading = resolve)));
      signIn("camille");
      const view = render(<AnalyticsTracking />);

      signOut();
      view.rerender(<AnalyticsTracking />);
      finishLoading();
      await settle();

      expect(client.identify).not.toHaveBeenCalled();
      expect(client.screen).not.toHaveBeenCalled();
    });
  });

  describe("where", () => {
    /** On device, the first screen after a sign-in went to the visitor, before the identify. */
    it("sends a screen only after the cook it belongs to is identified", async () => {
      route.segments = ["onboarding", "promise"];
      const view = render(<AnalyticsTracking />);
      signIn("camille");
      view.rerender(<AnalyticsTracking />);
      await settle();

      expect(screens()).toEqual(["/onboarding/promise"]);
      expect(client.identify.mock.invocationCallOrder[0]).toBeLessThan(client.screen.mock.invocationCallOrder[0]!);
    });

    /** Two recipes are one screen: an id in the name would make every recipe its own. */
    it("names a screen by its route pattern, groups included", async () => {
      signIn("camille");
      route.segments = ["recipe", "[id]", "step-by-step"];
      const view = render(<AnalyticsTracking />);
      await settle();
      route.segments = ["(modals)", "preferences"];
      view.rerender(<AnalyticsTracking />);
      await settle();
      route.segments = [];
      view.rerender(<AnalyticsTracking />);
      await settle();

      expect(screens()).toEqual(["/recipe/[id]/step-by-step", "/(modals)/preferences", "/"]);
    });

    /** A signed-out launch sits on home under the gate's cover, then on `/auth`. */
    it("sends nothing while nobody is signed in, nor the sign-in screen the cook becomes known on", async () => {
      const view = render(<AnalyticsTracking />);
      route.segments = ["auth"];
      view.rerender(<AnalyticsTracking />);
      await settle();
      signIn("camille");
      view.rerender(<AnalyticsTracking />);
      await settle();

      expect(client.screen).not.toHaveBeenCalled();

      route.segments = ["onboarding", "promise"];
      view.rerender(<AnalyticsTracking />);
      await settle();

      expect(screens()).toEqual(["/onboarding/promise"]);
    });

    it("sends a screen once per navigation, not once per render or auth flicker", async () => {
      signIn("camille");
      route.segments = ["recipes"];
      const view = render(<AnalyticsTracking />);
      await settle();
      view.rerender(<AnalyticsTracking />);
      Object.assign(auth, { userId: null, isDeciding: true });
      view.rerender(<AnalyticsTracking />);
      signIn("camille");
      view.rerender(<AnalyticsTracking />);
      await settle();

      expect(screens()).toEqual(["/recipes"]);
    });

    it("sends the screen a cook lands on after signing out and back in", async () => {
      signIn("camille");
      route.segments = ["account"];
      const view = render(<AnalyticsTracking />);
      await settle();

      signOut();
      route.segments = ["auth"];
      view.rerender(<AnalyticsTracking />);
      await settle();
      signIn("camille");
      route.segments = ["account"];
      view.rerender(<AnalyticsTracking />);
      await settle();

      expect(screens()).toEqual(["/account", "/account"]);
    });
  });
});
