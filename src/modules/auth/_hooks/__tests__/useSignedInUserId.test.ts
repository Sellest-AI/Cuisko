import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSignedInUserId } from "../useSignedInUserId";

/** What auth and the `getMe` query report; a test sets both, then renders. */
const state = vi.hoisted(() => ({
  isAuthenticated: false,
  isAuthenticating: false,
  query: { data: undefined as { id: string } | undefined, isPending: false, isError: false },
}));

vi.mock("~/lib/convex/api", () => ({ api: { router: { users: { getMe: { authed: "getMe" } } } } }));
vi.mock("~/lib/convex/auth", () => ({
  useAuthenticated: () => ({ isAuthenticated: state.isAuthenticated, isAuthenticating: state.isAuthenticating }),
}));
vi.mock("~/lib/convex/client", () => ({ useQueryCached: () => state.query }));

const render = () => renderHook(() => useSignedInUserId()).result.current;

describe("useSignedInUserId", () => {
  beforeEach(() => {
    Object.assign(state, { isAuthenticated: false, isAuthenticating: false });
    state.query = { data: undefined, isPending: false, isError: false };
  });

  it("is the cook's id once auth has settled and their row has arrived", () => {
    state.isAuthenticated = true;
    state.query = { data: { id: "camille" }, isPending: false, isError: false };

    expect(render()).toEqual({ userId: "camille", isDeciding: false });
  });

  it("is nobody, settled, when no one is signed in", () => {
    expect(render()).toEqual({ userId: null, isDeciding: false });
  });

  it("is deciding while auth has not settled", () => {
    state.isAuthenticating = true;

    expect(render()).toEqual({ userId: null, isDeciding: true });
  });

  it("is deciding while the signed-in cook's row is loading", () => {
    state.isAuthenticated = true;
    state.query = { data: undefined, isPending: true, isError: false };

    expect(render()).toEqual({ userId: null, isDeciding: true });
  });

  /** Read as "nobody signed in", it reset analytics for a cook who never left. */
  it("is deciding, not signed out, when the signed-in cook's row failed to load", () => {
    state.isAuthenticated = true;
    state.query = { data: undefined, isPending: false, isError: true };

    expect(render()).toEqual({ userId: null, isDeciding: true });
  });
});
