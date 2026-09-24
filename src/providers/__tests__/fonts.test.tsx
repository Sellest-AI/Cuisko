import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FontsProvider } from "../fonts";

/**
 * The provider's contract with `AuthGate`, which owns the splash screen and waits for the font only
 * by being mounted below this provider. So what matters is exactly when children render, and that
 * nothing here touches the splash — a second owner would drop it before auth settles.
 */
/**
 * Splash calls are recorded in a plain array rather than on `vi.fn()` spies, on purpose. The old
 * version of this provider held the splash at module scope — on import, before any test runs — and
 * `test/setup.dom.ts` clears every mock between tests, which would wipe exactly that call and let
 * it come back unnoticed. The functions resolve like the real module, so a regression reaches the
 * assertion instead of crashing on a `.catch` of undefined first.
 */
const state = vi.hoisted(() => ({
  fonts: [false, null] as [boolean, Error | null],
  splashCalls: [] as string[],
}));

vi.mock("expo-font", () => ({ useFonts: () => state.fonts }));
vi.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: () => (state.splashCalls.push("preventAutoHideAsync"), Promise.resolve(true)),
  hideAsync: () => (state.splashCalls.push("hideAsync"), Promise.resolve()),
  hide: () => void state.splashCalls.push("hide"),
}));

const renderProvider = () =>
  render(
    <FontsProvider>
      <p>app</p>
    </FontsProvider>,
  );

beforeEach(() => {
  state.fonts = [false, null];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FontsProvider", () => {
  it("renders nothing while the font is still loading", () => {
    renderProvider();
    expect(screen.queryByText("app")).toBeNull();
  });

  it("renders its children once the font is registered", () => {
    state.fonts = [true, null];
    renderProvider();
    expect(screen.getByText("app")).toBeTruthy();
  });

  it("renders its children when the font fails, so the splash held below it can still lift", () => {
    state.fonts = [false, new Error("font missing")];
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    renderProvider();

    expect(screen.getByText("app")).toBeTruthy();
  });

  it("never touches the splash screen, which AuthGate alone owns", () => {
    renderProvider();
    state.fonts = [true, null];
    renderProvider();

    expect(state.splashCalls).toEqual([]);
  });
});
