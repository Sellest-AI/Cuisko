import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthenticated } from "../auth";

/**
 * `useAuthenticated` against the states the vendor hooks pass through. Both vendor hooks are faked,
 * so each test is one frame of a real sign-in, held still.
 */
const vendor = vi.hoisted(() => ({
  token: null as string | null,
  convex: { isAuthenticated: false, isLoading: false },
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: vi.fn(), signOut: vi.fn() }),
  useAuthToken: () => vendor.token,
}));

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useConvexAuth: () => vendor.convex,
}));

vi.mock("expo-web-browser", () => ({ openAuthSessionAsync: vi.fn() }));
vi.mock("expo-linking", () => ({ createURL: () => "cuisko://" }));
vi.mock("../storage", () => ({ convexAuthStorage: { clear: vi.fn() } }));

const frame = () => renderHook(() => useAuthenticated()).result.current;

beforeEach(() => {
  vendor.token = null;
  vendor.convex = { isAuthenticated: false, isLoading: false };
});

describe("useAuthenticated", () => {
  it("is signed out, and settled, with no token", () => {
    expect(frame()).toMatchObject({ isAuthenticated: false, isAuthenticating: false });
  });

  /**
   * The flicker this exists for: the token has landed, and Convex still reports its signed-out
   * state for one render before it starts confirming. Read as settled, every gate bounced to its
   * signed-out answer for that frame.
   */
  it("is authenticating, not signed out, while Convex has not confirmed a new token", () => {
    vendor.token = "token";

    expect(frame()).toMatchObject({ isAuthenticated: false, isAuthenticating: true });
  });

  it("is authenticating while Convex is confirming", () => {
    vendor.token = "token";
    vendor.convex = { isAuthenticated: false, isLoading: true };

    expect(frame()).toMatchObject({ isAuthenticated: false, isAuthenticating: true });
  });

  it("is authenticated once Convex has confirmed the token", () => {
    vendor.token = "token";
    vendor.convex = { isAuthenticated: true, isLoading: false };

    expect(frame()).toMatchObject({ isAuthenticated: true, isAuthenticating: false });
  });
});
