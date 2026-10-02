import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ARM_RESET_WINDOW_MS, useArmedPress } from "../useArmedPress";

describe("useArmedPress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("arms on the first press and confirms on the second", () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useArmedPress(onConfirm));

    act(() => result.current.onPress());
    expect(result.current.isArmed).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();

    act(() => result.current.onPress());
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(result.current.isArmed).toBe(false);
  });

  it("forgets the first press once the window has passed, so a late tap only arms again", () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useArmedPress(onConfirm));

    act(() => result.current.onPress());
    act(() => vi.advanceTimersByTime(ARM_RESET_WINDOW_MS));
    expect(result.current.isArmed).toBe(false);

    act(() => result.current.onPress());
    expect(onConfirm).not.toHaveBeenCalled();
    expect(result.current.isArmed).toBe(true);
  });

  it("stays armed until the window has fully passed", () => {
    const { result } = renderHook(() => useArmedPress(vi.fn()));

    act(() => result.current.onPress());
    act(() => vi.advanceTimersByTime(ARM_RESET_WINDOW_MS - 1));

    expect(result.current.isArmed).toBe(true);
  });

  /**
   * The button changes its words to "Tap again to delete" at once, so a cook who reads them and taps
   * is answering the button. That tap comes a few hundred milliseconds after the first, and a guard
   * longer than a double tap swallowed it: the button did nothing, and only a third tap deleted.
   * The guard is there for a double tap, which is under 300ms, and must not reach past it.
   */
  it("lets a deliberate second tap through, half a second after the first", () => {
    const { result } = renderHook(() => useArmedPress(vi.fn()));

    expect(result.current.doubleTapDelay).toBeLessThan(500);
  });

  it("still drops a double tap, so it can only arm", () => {
    const { result } = renderHook(() => useArmedPress(vi.fn()));

    expect(result.current.doubleTapDelay).toBeGreaterThan(300);
  });

  it("confirms with the latest callback, not the one it was armed under", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(({ onConfirm }) => useArmedPress(onConfirm), {
      initialProps: { onConfirm: first },
    });

    act(() => result.current.onPress());
    rerender({ onConfirm: second });
    act(() => result.current.onPress());

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});
