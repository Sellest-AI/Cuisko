import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AnalyticsIdentity } from "../analytics-identity";

/** Who auth says is signed in; a test changes it, then re-renders. */
const auth = vi.hoisted(() => ({ userId: null as string | null, isDeciding: false }));

/** What analytics holds, starting as the device's visitor. */
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
    },
  };
});

vi.mock("../_hooks/useSignedInUserId", () => ({ useSignedInUserId: () => auth }));
vi.mock("posthog-react-native", () => ({ usePostHog: () => analytics.client }));

const signIn = (id: string) => Object.assign(auth, { userId: id, isDeciding: false });
const signOut = () => Object.assign(auth, { userId: null, isDeciding: false });

describe("AnalyticsIdentity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signOut();
    Object.assign(analytics.state, { distinctId: "visitor", anonymousId: "visitor" });
  });

  it("identifies the cook by their id alone, once, when they sign in", async () => {
    const view = render(<AnalyticsIdentity />);
    signIn("camille");
    view.rerender(<AnalyticsIdentity />);
    view.rerender(<AnalyticsIdentity />);

    await waitFor(() => expect(analytics.client.identify).toHaveBeenCalledWith("camille"));
    expect(analytics.client.identify).toHaveBeenCalledTimes(1);
    expect(analytics.client.reset).not.toHaveBeenCalled();
  });

  it("resets when the cook signs out, so the next one starts as a visitor", async () => {
    signIn("camille");
    const view = render(<AnalyticsIdentity />);
    await waitFor(() => expect(analytics.client.identify).toHaveBeenCalled());

    signOut();
    view.rerender(<AnalyticsIdentity />);

    await waitFor(() => expect(analytics.client.reset).toHaveBeenCalledTimes(1));
  });

  /** A session that expired while the app was closed leaves Hugo held on the next launch. */
  it("resets a cook left over from an earlier session before identifying the one signing in", async () => {
    analytics.state.distinctId = "hugo";
    signIn("camille");
    render(<AnalyticsIdentity />);

    await waitFor(() => expect(analytics.client.identify).toHaveBeenCalledWith("camille"));
    expect(analytics.client.reset).toHaveBeenCalledTimes(1);
    expect(analytics.client.reset.mock.invocationCallOrder[0]).toBeLessThan(
      analytics.client.identify.mock.invocationCallOrder[0]!,
    );
  });

  /** A token being refreshed is not a sign-out. */
  it("waits while auth is still deciding", async () => {
    analytics.state.distinctId = "camille";
    Object.assign(auth, { userId: null, isDeciding: true });
    render(<AnalyticsIdentity />);

    await Promise.resolve();
    expect(analytics.client.ready).not.toHaveBeenCalled();
    expect(analytics.client.reset).not.toHaveBeenCalled();
  });

  /** Analytics still loading from storage when Camille signs out: her identify must not land after. */
  it("drops a decision made for a cook who has since signed out", async () => {
    let finishLoading = () => {};
    analytics.client.ready.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finishLoading = resolve)),
    );
    signIn("camille");
    const view = render(<AnalyticsIdentity />);

    signOut();
    view.rerender(<AnalyticsIdentity />);
    finishLoading();

    await waitFor(() => expect(analytics.client.ready).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(analytics.client.identify).not.toHaveBeenCalled();
  });

  it("does nothing for a visitor who never signs in", async () => {
    render(<AnalyticsIdentity />);

    await waitFor(() => expect(analytics.client.ready).toHaveBeenCalled());
    expect(analytics.client.identify).not.toHaveBeenCalled();
    expect(analytics.client.reset).not.toHaveBeenCalled();
  });
});
