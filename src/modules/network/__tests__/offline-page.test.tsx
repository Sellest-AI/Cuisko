import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OfflinePage } from "../offline-page";

/** The page against the socket coming back, with the router faked: where it sends the cook. */
const state = vi.hoisted(() => ({
  from: undefined as string | undefined,
  socket: { isWebSocketConnected: false, hasEverConnected: true },
  replace: vi.fn(),
  dismissTo: vi.fn(),
}));

vi.mock("expo-router", () => ({
  router: { replace: state.replace, dismissTo: state.dismissTo },
  useLocalSearchParams: () => ({ from: state.from }),
}));

vi.mock("convex/react", () => ({ useConvexConnectionState: () => state.socket }));

vi.mock("translations", () => ({ useTranslations: () => (key: string) => key }));

vi.mock("@ui/icons", () => ({ House: {}, WifiOff: {} }));

/**
 * The design system's empty state, reduced to its words and buttons: its icons and buttons pull in
 * native modules jsdom cannot load, and what is under test is where the page sends the cook.
 */
vi.mock("@ui/empty-state", () => ({
  EmptyState: ({ title, actions }: { title: string; actions: { label: string; onPress: () => void }[] }) => (
    <div>
      <h1>{title}</h1>
      {actions.map((action) => (
        <button key={action.label} onClick={action.onPress}>{action.label}</button>
      ))}
    </div>
  ),
}));

const reconnect = (view: ReturnType<typeof render>) => {
  state.socket = { isWebSocketConnected: true, hasEverConnected: true };
  view.rerender(<OfflinePage />);
};

beforeEach(() => {
  state.from = undefined;
  state.socket = { isWebSocketConnected: false, hasEverConnected: true };
  state.replace.mockReset();
  state.dismissTo.mockReset();
});

describe("OfflinePage", () => {
  it("goes home from its button", () => {
    render(<OfflinePage />);
    fireEvent.click(screen.getByText("offline_home"));

    expect(state.dismissTo).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("stays while the socket is down", () => {
    state.from = JSON.stringify({ pathname: "/recipe/[id]", params: { id: "123" } });
    render(<OfflinePage />);

    expect(state.replace).not.toHaveBeenCalled();
  });

  it("opens the route the cook asked for once the socket is back, query included", () => {
    state.from = JSON.stringify({ pathname: "/recipe/[id]", params: { id: "123", servings: "4" } });
    reconnect(render(<OfflinePage />));

    expect(state.replace).toHaveBeenCalledExactlyOnceWith({
      pathname: "/recipe/[id]",
      params: { id: "123", servings: "4" },
    });
  });

  it("keeps a repeated param as a list", () => {
    state.from = JSON.stringify({ pathname: "/recipes", params: { tag: ["vegan", "quick"] } });
    reconnect(render(<OfflinePage />));

    expect(state.replace).toHaveBeenCalledExactlyOnceWith({ pathname: "/recipes", params: { tag: ["vegan", "quick"] } });
  });

  it("goes home when there is no route to go back to, or it does not read", () => {
    const view = render(<OfflinePage />);
    reconnect(view);
    expect(state.replace).toHaveBeenLastCalledWith("/");

    vi.spyOn(console, "warn").mockImplementation(() => {});
    state.from = '{"pathname":';
    view.rerender(<OfflinePage />);
    expect(state.replace).toHaveBeenLastCalledWith("/");
  });
});
