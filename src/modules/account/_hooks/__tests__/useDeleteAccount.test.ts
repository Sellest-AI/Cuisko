import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ACCOUNT_DELETION_GRACE_MS } from "@shared/accountDeletion";

import { useDeleteAccount } from "../useDeleteAccount";

const state = vi.hoisted(() => ({
  requestDeletion: vi.fn(),
  signOut: vi.fn(),
  onSignOutFailed: vi.fn(),
}));

vi.mock("~/lib/convex/client", () => ({
  useMutation: () => ({ mutate: state.requestDeletion, isLoading: false }),
}));
vi.mock("~/modules/auth/hooks", () => ({ useAuth: () => ({ signOut: state.signOut }) }));

const NOW = Date.UTC(2026, 9, 3, 12);

describe("useDeleteAccount", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    state.requestDeletion.mockReset().mockResolvedValue(NOW + ACCOUNT_DELETION_GRACE_MS);
    state.signOut.mockReset().mockResolvedValue(undefined);
    state.onSignOutFailed.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => vi.useRealTimers());

  it("knows the date before anything is asked, so the sheet can say it first", () => {
    const { result } = renderHook(() => useDeleteAccount({ onSignOutFailed: state.onSignOutFailed }));

    expect(result.current.dueAt).toBe(NOW + ACCOUNT_DELETION_GRACE_MS);
    expect(state.requestDeletion).not.toHaveBeenCalled();
  });

  it("keeps the date it opened with while the sheet is read", () => {
    const { result, rerender } = renderHook(() => useDeleteAccount({ onSignOutFailed: state.onSignOutFailed }));

    vi.setSystemTime(NOW + 60 * 60 * 1000);
    rerender();

    expect(result.current.dueAt).toBe(NOW + ACCOUNT_DELETION_GRACE_MS);
  });

  it("asks the server, then signs the cook out", async () => {
    const { result } = renderHook(() => useDeleteAccount({ onSignOutFailed: state.onSignOutFailed }));

    await act(() => result.current.request());

    expect(state.requestDeletion).toHaveBeenCalledWith({});
    expect(state.signOut).toHaveBeenCalledOnce();
    expect(state.requestDeletion.mock.invocationCallOrder[0]).toBeLessThan(
      state.signOut.mock.invocationCallOrder[0]!,
    );
  });

  it("keeps the cook signed in when the request is refused, and says so", async () => {
    state.requestDeletion.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useDeleteAccount({ onSignOutFailed: state.onSignOutFailed }));

    await act(() => result.current.request());

    expect(result.current.hasError).toBe(true);
    expect(state.signOut).not.toHaveBeenCalled();
  });

  it("clears the error when asked again", async () => {
    state.requestDeletion.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useDeleteAccount({ onSignOutFailed: state.onSignOutFailed }));

    await act(() => result.current.request());
    await act(() => result.current.request());

    expect(result.current.hasError).toBe(false);
    expect(state.signOut).toHaveBeenCalledOnce();
  });

  /**
   * The deletion is scheduled but the session survived, so there is nothing left for the sheet to
   * ask: it hands control back (the screen closes itself) rather than sitting there armed.
   */
  it("hands back when signing out fails after the request landed, without throwing", async () => {
    state.signOut.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useDeleteAccount({ onSignOutFailed: state.onSignOutFailed }));

    await expect(act(() => result.current.request())).resolves.toBeUndefined();
    expect(state.onSignOutFailed).toHaveBeenCalledOnce();
  });

  it("does not hand back when the cook is signed out, or when the request was refused", async () => {
    const { result } = renderHook(() => useDeleteAccount({ onSignOutFailed: state.onSignOutFailed }));
    await act(() => result.current.request());

    state.requestDeletion.mockRejectedValue(new Error("offline"));
    await act(() => result.current.request());

    expect(state.onSignOutFailed).not.toHaveBeenCalled();
  });
});
