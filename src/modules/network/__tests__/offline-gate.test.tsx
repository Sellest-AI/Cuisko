import { act, render } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isOfflineAtom } from "../_hooks/atoms";
import { OFFLINE_GRACE_MS } from "../constants";
import { OfflineGate } from "../offline-gate";

/**
 * The gate against the routes a cook opens, with the socket and the navigator faked. A route is its
 * pathname (what `OFFLINE_ROUTES` names), its template and params (what `from` carries), and the
 * root tree's keys with the focused one (what tells arriving from staying).
 */
type Route = { pathname: string; segments: string[]; params: Record<string, string>; key: string };

const HOME: Route = { pathname: "/", segments: [], params: {}, key: "index-1" };
const RECIPES: Route = { pathname: "/recipes", segments: ["recipes"], params: {}, key: "recipes-1" };
const GROCERIES: Route = { pathname: "/groceries", segments: ["groceries"], params: {}, key: "groceries-1" };
const EDITOR: Route = { pathname: "/recipe/new", segments: ["recipe", "new"], params: {}, key: "new-1" };
const RECIPE: Route = { pathname: "/recipe/123", segments: ["recipe", "[id]"], params: { id: "123", servings: "4" }, key: "recipe-1" };
const MEAL: Route = { pathname: "/meal", segments: ["(modals)", "meal"], params: {}, key: "meal-1" };

const state = vi.hoisted(() => ({
  route: undefined as unknown as Route,
  /** The root tree's keys, top to bottom. */
  stack: [] as string[],
  isReady: true,
  auth: { isLoading: false, hasSession: true },
  socket: { isWebSocketConnected: true, hasEverConnected: true },
  reset: vi.fn(),
}));

vi.mock("expo-router", () => {
  const navigation = {
    isReady: () => state.isReady,
    getRootState: () => ({ routes: state.stack.map((key) => ({ key })) }),
    getCurrentRoute: () => ({ key: state.route.key }),
    reset: state.reset,
  };
  return {
    useNavigationContainerRef: () => navigation,
    usePathname: () => state.route.pathname,
    useSegments: () => state.route.segments,
    useGlobalSearchParams: () => state.route.params,
  };
});

vi.mock("~/modules/auth/hooks", () => ({ useAuth: () => state.auth }));

vi.mock("convex/react", () => ({ useConvexConnectionState: () => state.socket }));

/** Opens a route on top of the stack, as a push does. */
const open = (route: Route) => {
  state.route = route;
  state.stack = [...state.stack, route.key];
};

/** Goes back to a route still in the stack, as a back press or a sheet closing does. */
const backTo = (route: Route) => {
  state.route = route;
  state.stack = state.stack.slice(0, state.stack.indexOf(route.key) + 1);
};

const dropSignal = () => {
  state.socket = { ...state.socket, isWebSocketConnected: false };
};

const pass = (ms: number) => act(() => vi.advanceTimersByTime(ms));

const blockedWith = (from: { pathname: string; params: Record<string, string> }) => ({
  index: 1,
  routes: [{ name: "index" }, { name: "offline", params: { from: JSON.stringify(from) } }],
});

beforeEach(() => {
  vi.useFakeTimers();
  // The app-wide reading lives in Jotai's default store, which outlives a test.
  getDefaultStore().set(isOfflineAtom, false);
  state.route = HOME;
  state.stack = [HOME.key];
  state.isReady = true;
  state.auth = { isLoading: false, hasSession: true };
  state.socket = { isWebSocketConnected: true, hasEverConnected: true };
  state.reset.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("OfflineGate, mid-session", () => {
  it("leaves a route that was already up when the signal drops", async () => {
    open(EDITOR);
    const view = render(<OfflineGate />);

    dropSignal();
    view.rerender(<OfflineGate />);
    await pass(OFFLINE_GRACE_MS);

    expect(state.reset).not.toHaveBeenCalled();
  });

  it("sends a route opened offline to the offline page, with Home under it", async () => {
    const view = render(<OfflineGate />);
    dropSignal();
    view.rerender(<OfflineGate />);
    await pass(OFFLINE_GRACE_MS);

    open(RECIPES);
    view.rerender(<OfflineGate />);

    expect(state.reset).toHaveBeenCalledExactlyOnceWith(blockedWith({ pathname: "/recipes", params: {} }));
  });

  it("keeps the query of the route it turned away", async () => {
    const view = render(<OfflineGate />);
    dropSignal();
    view.rerender(<OfflineGate />);
    await pass(OFFLINE_GRACE_MS);

    open(RECIPE);
    view.rerender(<OfflineGate />);

    expect(state.reset).toHaveBeenCalledExactlyOnceWith(
      blockedWith({ pathname: "/recipe/[id]", params: { id: "123", servings: "4" } }),
    );
  });

  it("turns a sheet away the same way", async () => {
    const view = render(<OfflineGate />);
    dropSignal();
    view.rerender(<OfflineGate />);
    await pass(OFFLINE_GRACE_MS);

    open(MEAL);
    view.rerender(<OfflineGate />);

    expect(state.reset).toHaveBeenCalledExactlyOnceWith(blockedWith({ pathname: "/(modals)/meal", params: {} }));
  });

  it("lets a back press land on a route that stayed mounted", async () => {
    open(RECIPES);
    const view = render(<OfflineGate />);
    open(GROCERIES);
    view.rerender(<OfflineGate />);
    dropSignal();
    view.rerender(<OfflineGate />);
    await pass(OFFLINE_GRACE_MS);

    backTo(RECIPES);
    view.rerender(<OfflineGate />);

    expect(state.reset).not.toHaveBeenCalled();
  });

  it("lets a sheet close back onto the editor", async () => {
    open(EDITOR);
    const view = render(<OfflineGate />);
    open({ ...MEAL, pathname: "/quantity", segments: ["(modals)", "quantity"], key: "quantity-1" });
    view.rerender(<OfflineGate />);
    dropSignal();
    view.rerender(<OfflineGate />);
    await pass(OFFLINE_GRACE_MS);

    backTo(EDITOR);
    view.rerender(<OfflineGate />);

    expect(state.reset).not.toHaveBeenCalled();
  });

  it.each(["/", "/groceries", "/assistant", "/quantity", "/offline"])("lets %s open offline", async (pathname) => {
    const view = render(<OfflineGate />);
    dropSignal();
    view.rerender(<OfflineGate />);
    await pass(OFFLINE_GRACE_MS);

    open({ pathname, segments: pathname.slice(1).split("/"), params: {}, key: `${pathname}-1` });
    view.rerender(<OfflineGate />);

    expect(state.reset).not.toHaveBeenCalled();
  });

  it("turns away a route opened during the grace once the grace runs out", async () => {
    const view = render(<OfflineGate />);
    dropSignal();
    view.rerender(<OfflineGate />);
    await pass(OFFLINE_GRACE_MS - 500);

    open(RECIPES);
    view.rerender(<OfflineGate />);
    expect(state.reset).not.toHaveBeenCalled();
    await pass(500);

    expect(state.reset).toHaveBeenCalledExactlyOnceWith(blockedWith({ pathname: "/recipes", params: {} }));
  });

  it("does nothing on a blip under the grace", async () => {
    const view = render(<OfflineGate />);
    dropSignal();
    view.rerender(<OfflineGate />);
    await pass(OFFLINE_GRACE_MS - 500);
    open(RECIPES);
    view.rerender(<OfflineGate />);

    state.socket = { ...state.socket, isWebSocketConnected: true };
    view.rerender(<OfflineGate />);
    await pass(OFFLINE_GRACE_MS);

    expect(state.reset).not.toHaveBeenCalled();
  });

  it("does nothing online", async () => {
    const view = render(<OfflineGate />);
    open(RECIPES);
    view.rerender(<OfflineGate />);
    await pass(OFFLINE_GRACE_MS);

    expect(state.reset).not.toHaveBeenCalled();
  });
});

describe("OfflineGate, on a cold start", () => {
  beforeEach(() => {
    state.socket = { isWebSocketConnected: false, hasEverConnected: false };
    state.route = RECIPE;
    state.stack = [RECIPE.key];
  });

  it("opens a deep link normally when the socket connects within the grace", async () => {
    const view = render(<OfflineGate />);
    await pass(1_000);
    state.socket = { isWebSocketConnected: true, hasEverConnected: true };
    view.rerender(<OfflineGate />);
    await pass(OFFLINE_GRACE_MS);

    expect(state.reset).not.toHaveBeenCalled();
  });

  it("turns a deep link away once the grace runs out with no socket", async () => {
    render(<OfflineGate />);
    await pass(OFFLINE_GRACE_MS);

    expect(state.reset).toHaveBeenCalledExactlyOnceWith(
      blockedWith({ pathname: "/recipe/[id]", params: { id: "123", servings: "4" } }),
    );
  });

  it("waits for the navigator and for the auth gate to settle", async () => {
    state.isReady = false;
    state.auth = { isLoading: true, hasSession: true };
    const view = render(<OfflineGate />);
    await pass(OFFLINE_GRACE_MS);
    expect(state.reset).not.toHaveBeenCalled();

    state.isReady = true;
    view.rerender(<OfflineGate />);
    expect(state.reset).not.toHaveBeenCalled();

    state.auth = { isLoading: false, hasSession: true };
    view.rerender(<OfflineGate />);
    expect(state.reset).toHaveBeenCalledOnce();
  });
});
