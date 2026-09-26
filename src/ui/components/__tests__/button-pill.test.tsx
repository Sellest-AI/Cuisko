import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ButtonPill } from "../button-pill";

/**
 * `Pressable` reaches `expo-haptics`, which jsdom cannot load. The stand-in forwards every tap, so
 * the only thing between two taps and two calls is `ButtonPill`'s own guard.
 */
vi.mock("../pressable", () => ({
  Pressable: ({ onPress, children }: { onPress: () => void; children: React.ReactNode }) => (
    <button onClick={onPress}>{children}</button>
  ),
}));

vi.mock("../blur-view", () => ({
  BlurView: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("expo-linear-gradient", () => ({ LinearGradient: () => null }));

vi.mock("../button-icon", () => ({ ButtonIcon: () => null }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

const tap = () => fireEvent.click(screen.getByText("Delete"));

/**
 * `doubleTapDelay` exists for a button whose first press changes what the second does: arming a
 * delete. A double tap landing both presses would arm and delete in one gesture.
 */
describe("ButtonPill doubleTapDelay", () => {
  it("drops a second press inside the delay", () => {
    const onPress = vi.fn();
    render(<ButtonPill onPress={onPress} doubleTapDelay={800}>Delete</ButtonPill>);

    tap();
    vi.setSystemTime(799);
    tap();

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("answers a press once the delay has passed", () => {
    const onPress = vi.fn();
    render(<ButtonPill onPress={onPress} doubleTapDelay={800}>Delete</ButtonPill>);

    tap();
    vi.setSystemTime(800);
    tap();

    expect(onPress).toHaveBeenCalledTimes(2);
  });

  /** Measured from the last press that counted, so tapping through the delay cannot extend it. */
  it("measures from the accepted press, not from a dropped one", () => {
    const onPress = vi.fn();
    render(<ButtonPill onPress={onPress} doubleTapDelay={800}>Delete</ButtonPill>);

    tap();
    vi.setSystemTime(500);
    tap();
    vi.setSystemTime(800);
    tap();

    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it("answers every press without one", () => {
    const onPress = vi.fn();
    render(<ButtonPill onPress={onPress}>Delete</ButtonPill>);

    tap();
    tap();

    expect(onPress).toHaveBeenCalledTimes(2);
  });
});
