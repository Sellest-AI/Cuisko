import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HomeHeader } from "../header";

/**
 * Where the avatar leads, with the router faked and the avatar reduced to a button that is disabled
 * when it is given nothing to do (as the real one draws a plain view then).
 */
const state = vi.hoisted(() => ({
  isOffline: false,
  auth: { user: undefined, hasSession: true },
  push: vi.fn(),
  dismissTo: vi.fn(),
}));

vi.mock("expo-router", () => ({ router: { push: state.push, dismissTo: state.dismissTo } }));
vi.mock("~/modules/auth/hooks", () => ({ useAuth: () => state.auth }));
vi.mock("~/modules/network/hooks", () => ({ useIsOffline: () => state.isOffline }));
vi.mock("@ui/safe-area-view", () => ({ SafeAreaView: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("~/modules/households/household-select", () => ({ HouseholdSelect: () => <span>offline_chip</span> }));
vi.mock("@ui/avatar", () => ({
  Avatar: ({ onPress }: { onPress?: () => void }) => (
    <button aria-label="avatar" disabled={!onPress} onClick={onPress} />
  ),
}));

beforeEach(() => {
  state.isOffline = false;
  state.auth = { user: undefined, hasSession: true };
  state.push.mockReset();
  state.dismissTo.mockReset();
});

describe("HomeHeader", () => {
  it("opens the account drawer for a cook with a session", () => {
    render(<HomeHeader />);
    fireEvent.click(screen.getByLabelText("avatar"));

    expect(state.push).toHaveBeenCalledExactlyOnceWith("/account");
  });

  it("draws the offline chip in place of the avatar: the drawer could not reach the server", () => {
    state.isOffline = true;
    render(<HomeHeader />);

    expect(screen.getByText("offline_chip")).toBeInTheDocument();
    expect(screen.queryByLabelText("avatar")).toBeNull();
  });
});
