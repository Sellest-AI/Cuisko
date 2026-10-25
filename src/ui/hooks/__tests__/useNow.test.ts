import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useNow } from "../useNow";

const START = 1_760_000_000_000;

describe("useNow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });
  afterEach(() => vi.useRealTimers());

  it("ticks each second while active", () => {
    const { result } = renderHook(() => useNow(true));
    expect(result.current).toBe(START);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(START + 1000);

    act(() => vi.advanceTimersByTime(2000));
    expect(result.current).toBe(START + 3000);
  });

  it("stands still while not active", () => {
    const { result } = renderHook(() => useNow(false));

    act(() => vi.advanceTimersByTime(5000));
    expect(result.current).toBe(START);
  });

  it("stops ticking once it is no longer active", () => {
    const { result, rerender } = renderHook(({ isActive }) => useNow(isActive), { initialProps: { isActive: true } });

    act(() => vi.advanceTimersByTime(1000));
    rerender({ isActive: false });
    act(() => vi.advanceTimersByTime(5000));

    expect(result.current).toBe(START + 1000);
  });
});
