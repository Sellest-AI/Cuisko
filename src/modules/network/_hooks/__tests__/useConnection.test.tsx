import { act, render, renderHook } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OFFLINE_GRACE_MS } from "../../constants";
import { isOfflineAtom } from "../atoms";
import { useConnection } from "../useConnection";
import { useWatchConnection } from "../useWatchConnection";

/** One watcher, as `OfflineGate` mounts it, and readers mounted around it, with the socket faked. */
const state = vi.hoisted(() => ({ socket: { isWebSocketConnected: true, hasEverConnected: true } }));

vi.mock("convex/react", () => ({ useConvexConnectionState: () => state.socket }));

const Watcher = () => {
  useWatchConnection();
  return null;
};

const pass = (ms: number) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
  getDefaultStore().set(isOfflineAtom, false);
  state.socket = { isWebSocketConnected: true, hasEverConnected: true };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useConnection", () => {
  it("reads offline at once in a screen mounted after the grace ran out", async () => {
    const watcher = render(<Watcher />);
    state.socket = { ...state.socket, isWebSocketConnected: false };
    watcher.rerender(<Watcher />);
    await pass(OFFLINE_GRACE_MS);

    const { result } = renderHook(() => useConnection());

    expect(result.current.isOffline).toBe(true);
  });

  it("stays online through a drop shorter than the grace", async () => {
    const watcher = render(<Watcher />);
    const { result } = renderHook(() => useConnection());
    state.socket = { ...state.socket, isWebSocketConnected: false };
    watcher.rerender(<Watcher />);
    await pass(OFFLINE_GRACE_MS - 500);

    expect(result.current.isOffline).toBe(false);
  });

  it("reads online the moment the socket is back, before the watcher has caught up", async () => {
    const watcher = render(<Watcher />);
    state.socket = { ...state.socket, isWebSocketConnected: false };
    watcher.rerender(<Watcher />);
    await pass(OFFLINE_GRACE_MS);

    state.socket = { ...state.socket, isWebSocketConnected: true };
    const { result } = renderHook(() => useConnection());

    expect(result.current).toMatchObject({ isConnected: true, isOffline: false });
  });
});
