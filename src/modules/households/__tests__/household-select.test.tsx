import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HouseholdSelect } from "../household-select";

/**
 * Which of the two the grocery list's header draws: the household switch, or the offline chip. The
 * design system's pieces are reduced to their words (they pull in native modules jsdom cannot load).
 */
const state = vi.hoisted(() => ({
  isOffline: false,
  households: { households: [] as { id: string; name: string }[], currentId: undefined as string | undefined, select: vi.fn() },
}));

vi.mock("~/modules/network/hooks", () => ({ useIsOffline: () => state.isOffline }));
vi.mock("../_hooks/useHouseholds", () => ({ useHouseholds: () => state.households }));
vi.mock("translations", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@ui/icons", () => ({ WifiOff: () => null }));
vi.mock("@ui/button", () => ({ Button: ({ children }: { children: string }) => <button disabled>{children}</button> }));
vi.mock("@ui/select", () => ({
  Select: ({ options }: { options: { label: string }[] }) => <select aria-label="household">{options.map((option) => <option key={option.label}>{option.label}</option>)}</select>,
}));

const RUE_DES_LILAS = { id: "h1", name: "Rue des Lilas" };

beforeEach(() => {
  state.isOffline = false;
  state.households = { households: [RUE_DES_LILAS], currentId: "h1", select: vi.fn() };
});

describe("HouseholdSelect", () => {
  it("draws the switch online", () => {
    render(<HouseholdSelect />);

    expect(screen.getByLabelText("household")).toBeInTheDocument();
    expect(screen.queryByText("offline_chip")).toBeNull();
  });

  /** Offline the households are not loaded at all: the chip must not wait for one. */
  it("draws the offline chip in its place, with no household loaded", () => {
    state.isOffline = true;
    state.households = { households: [], currentId: undefined, select: vi.fn() };
    render(<HouseholdSelect />);

    expect(screen.getByText("offline_chip")).toBeInTheDocument();
    expect(screen.queryByLabelText("household")).toBeNull();
  });
});
