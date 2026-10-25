import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RestartOnSignOut } from "../restart-on-sign-out";

/** Who auth says is signed in; a test changes it, then re-renders. */
const auth = vi.hoisted(() => ({ userId: null as string | null, isDeciding: false }));

/** The analytics client and the app's restart, both native edges. */
const native = vi.hoisted(() => ({
  flush: vi.fn(() => Promise.resolve()),
  reloadAppAsync: vi.fn(() => Promise.resolve()),
}));

vi.mock("../_hooks/useSignedInUserId", () => ({ useSignedInUserId: () => auth }));
vi.mock("posthog-react-native", () => ({ usePostHog: () => ({ flush: native.flush }) }));
vi.mock("expo", () => ({ reloadAppAsync: native.reloadAppAsync }));

const signIn = (id: string) => Object.assign(auth, { userId: id, isDeciding: false });
const signOut = () => Object.assign(auth, { userId: null, isDeciding: false });
const decide = () => Object.assign(auth, { userId: null, isDeciding: true });

describe("RestartOnSignOut", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signOut();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * The bug this exists for: the next cook to sign in on the device found the last one's
   * conversation with Cuisko, imports and staged photo, which no household switch empties. It
   * covers every way a session ends, a tapped sign-out as much as a refresh token that expired.
   */
  it("restarts the app once the signed-in cook is signed out", async () => {
    signIn("camille");
    const view = render(<RestartOnSignOut />);

    signOut();
    view.rerender(<RestartOnSignOut />);

    await waitFor(() => expect(native.reloadAppAsync).toHaveBeenCalledOnce());
  });

  it("sends what analytics still holds before the restart throws it away", async () => {
    signIn("camille");
    const view = render(<RestartOnSignOut />);

    signOut();
    view.rerender(<RestartOnSignOut />);

    await waitFor(() => expect(native.reloadAppAsync).toHaveBeenCalledOnce());
    expect(native.flush.mock.invocationCallOrder[0]).toBeLessThan(
      native.reloadAppAsync.mock.invocationCallOrder[0]!,
    );
  });

  /** Offline, PostHog retries for seconds; the cook who left must not wait on it. */
  it("restarts anyway when analytics cannot send in time", async () => {
    vi.useFakeTimers();
    native.flush.mockReturnValueOnce(new Promise(() => {}));
    signIn("camille");
    const view = render(<RestartOnSignOut />);

    signOut();
    view.rerender(<RestartOnSignOut />);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(native.reloadAppAsync).toHaveBeenCalledOnce();
  });

  it("restarts anyway when analytics fails to send", async () => {
    native.flush.mockRejectedValueOnce(new Error("offline"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    signIn("camille");
    const view = render(<RestartOnSignOut />);

    signOut();
    view.rerender(<RestartOnSignOut />);

    await waitFor(() => expect(native.reloadAppAsync).toHaveBeenCalledOnce());
  });

  it("does not restart a launch that starts signed out", async () => {
    const view = render(<RestartOnSignOut />);
    view.rerender(<RestartOnSignOut />);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(native.reloadAppAsync).not.toHaveBeenCalled();
  });

  /** A token being refreshed, or a sign-out still in flight, is not a session that ended. */
  it("does not restart while auth is still deciding", async () => {
    signIn("camille");
    const view = render(<RestartOnSignOut />);

    decide();
    view.rerender(<RestartOnSignOut />);
    signIn("camille");
    view.rerender(<RestartOnSignOut />);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(native.reloadAppAsync).not.toHaveBeenCalled();
  });

  /**
   * The flush can take up to its budget, and the sign-in screen is up underneath it. A cook who
   * tapped "Sign in with Google" there had the sheet torn down by the restart and had to start over.
   */
  it("covers the sign-in screen from the moment the session ends until the restart", () => {
    native.flush.mockReturnValueOnce(new Promise(() => {}));
    signIn("camille");
    const view = render(<RestartOnSignOut />);
    expect(view.container).toBeEmptyDOMElement();

    signOut();
    view.rerender(<RestartOnSignOut />);

    expect(view.container).not.toBeEmptyDOMElement();
    expect(native.reloadAppAsync).not.toHaveBeenCalled();
  });

  /** A cover nothing takes down is a blank app until the cook kills it; signing in beats that. */
  it("hands the sign-in screen back when the restart fails", async () => {
    native.reloadAppAsync.mockRejectedValueOnce(new Error("no reload"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    signIn("camille");
    const view = render(<RestartOnSignOut />);

    signOut();
    view.rerender(<RestartOnSignOut />);

    await waitFor(() => expect(view.container).toBeEmptyDOMElement());
    expect(native.reloadAppAsync).toHaveBeenCalledOnce();
  });

  it("restarts once, however often the signed-out screen re-renders", async () => {
    signIn("camille");
    const view = render(<RestartOnSignOut />);

    signOut();
    view.rerender(<RestartOnSignOut />);
    view.rerender(<RestartOnSignOut />);

    await waitFor(() => expect(native.reloadAppAsync).toHaveBeenCalled());
    expect(native.reloadAppAsync).toHaveBeenCalledOnce();
  });
});
