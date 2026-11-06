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

/** The app moving to the background or back, as `AppState` reports it. */
const appState = vi.hoisted(() => ({
  current: "active",
  /** Set to move the app in the gap between a screen reading `AppState` and subscribing to it. */
  movesTo: undefined as string | undefined,
  listeners: new Set<() => void>(),
}));

vi.mock("react-native", () => ({
  AppState: {
    get currentState() {
      return appState.current;
    },
    addEventListener: (_: "change", listener: () => void) => {
      if (appState.movesTo) appState.current = appState.movesTo;
      appState.listeners.add(listener);
      return { remove: () => appState.listeners.delete(listener) };
    },
  },
}));

const moveAppTo = (next: string) => act(() => {
  appState.current = next;
  appState.listeners.forEach((listener) => listener());
});

const Watcher = () => {
  useWatchConnection();
  return null;
};

const pass = (ms: number) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
  appState.current = "active";
  appState.movesTo = undefined;
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

  it("runs the grace from the return when the socket dropped in the background", async () => {
    const watcher = render(<Watcher />);
    const { result } = renderHook(() => useConnection());
    moveAppTo("background");
    state.socket = { ...state.socket, isWebSocketConnected: false };
    watcher.rerender(<Watcher />);
    await pass(60_000);

    moveAppTo("active");
    await pass(OFFLINE_GRACE_MS - 500);
    expect(result.current.isOffline).toBe(false);

    await pass(500);
    expect(result.current.isOffline).toBe(true);
  });

  it("restarts the grace when the app leaves during it", async () => {
    const watcher = render(<Watcher />);
    const { result } = renderHook(() => useConnection());
    state.socket = { ...state.socket, isWebSocketConnected: false };
    watcher.rerender(<Watcher />);
    await pass(OFFLINE_GRACE_MS - 500);

    moveAppTo("background");
    await pass(60_000);
    moveAppTo("active");
    await pass(OFFLINE_GRACE_MS - 500);
    expect(result.current.isOffline).toBe(false);

    await pass(500);
    expect(result.current.isOffline).toBe(true);
  });

  it("counts the grace when the app came to the foreground before the watcher subscribed", async () => {
    appState.current = "background";
    appState.movesTo = "active";
    state.socket = { ...state.socket, isWebSocketConnected: false };
    render(<Watcher />);
    await pass(OFFLINE_GRACE_MS);

    const { result } = renderHook(() => useConnection());

    expect(result.current.isOffline).toBe(true);
  });

  it("stays offline through a trip to the background: the grace is for a socket still reconnecting", async () => {
    const watcher = render(<Watcher />);
    const { result } = renderHook(() => useConnection());
    state.socket = { ...state.socket, isWebSocketConnected: false };
    watcher.rerender(<Watcher />);
    await pass(OFFLINE_GRACE_MS);

    moveAppTo("background");
    await pass(60_000);
    moveAppTo("active");

    expect(result.current.isOffline).toBe(true);
  });
});
