import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ALPHABETICAL_ORDERING_DELAY_MS, UNDO_WINDOW_MS } from "../../_model/model";
import { useLiveWindow } from "../useLiveWindow";

/**
 * The clock has to move for anything measured against it to be true.
 *
 * `_compare` settles a row into alphabetical order once it is `ALPHABETICAL_ORDERING_DELAY_MS`
 * old, but it measures that age against the clock this hook holds — so a clock that only wakes
 * for an undo receipt makes the settling unreachable on any screen where nothing was bought. That
 * is not a corner: adding lines without buying is the ordinary use of a grocery list.
 */
const MOUNTED_AT = new Date("2026-09-09T10:00:00.000Z").getTime();

describe("useLiveWindow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOUNTED_AT);
  });

  afterEach(() => vi.useRealTimers());

  it("starts at the moment it was mounted", () => {
    const { result } = renderHook(() => useLiveWindow([]));

    expect(result.current.getTime()).toBe(MOUNTED_AT);
  });

  /**
   * The regression. No receipt means no undo window, which used to mean no timer at all — the
   * clock stayed at mount for the whole session and rows never finished settling.
   */
  it("advances at a settling deadline with no receipt in sight", () => {
    const settlesAt = MOUNTED_AT + ALPHABETICAL_ORDERING_DELAY_MS;
    const { result } = renderHook(() => useLiveWindow([settlesAt]));

    expect(result.current.getTime()).toBe(MOUNTED_AT);

    act(() => void vi.advanceTimersByTime(ALPHABETICAL_ORDERING_DELAY_MS));

    expect(result.current.getTime()).toBe(settlesAt);
  });

  /**
   * A row touched *after* mount is the case that reported a negative age: its deadline is further
   * out than the one the clock was armed for, so the clock has to arrive there too, not stop at
   * the first wake.
   */
  it("reaches the settling deadline of a row touched after mount", () => {
    const touchedAt = MOUNTED_AT + 10_000;
    const settlesAt = touchedAt + ALPHABETICAL_ORDERING_DELAY_MS;
    const { result } = renderHook(() => useLiveWindow([settlesAt]));

    /** Its own deadline, not the one the clock happened to be armed for at mount. */
    act(() => void vi.advanceTimersByTime(ALPHABETICAL_ORDERING_DELAY_MS));

    expect(result.current.getTime()).toBe(MOUNTED_AT);

    act(() => void vi.advanceTimersByTime(10_000));

    expect(result.current.getTime()).toBe(settlesAt);
    /** The age `_compare` now measures is positive and past the threshold, not in the future. */
    expect(result.current.getTime() - touchedAt).toBe(ALPHABETICAL_ORDERING_DELAY_MS);
  });

  /** The soonest deadline wins, whichever rule it came from. */
  it("wakes for the nearest deadline before a later one", () => {
    const settlesAt = MOUNTED_AT + ALPHABETICAL_ORDERING_DELAY_MS;
    const expiresAt = MOUNTED_AT + UNDO_WINDOW_MS;
    const { result } = renderHook(() => useLiveWindow([expiresAt, settlesAt]));

    act(() => void vi.advanceTimersByTime(ALPHABETICAL_ORDERING_DELAY_MS));

    expect(result.current.getTime()).toBe(settlesAt);

    act(() => void vi.advanceTimersByTime(UNDO_WINDOW_MS));

    expect(result.current.getTime()).toBe(expiresAt);
  });

  /**
   * A cellar row's clock can be months out, and `setTimeout` cannot wait past 2^31 - 1 ms (about
   * 24.8 days): asked to, it fires after 1 ms instead, and the screen re-rendered in a loop. The
   * clock sleeps in capped stretches and still lands on the deadline itself.
   */
  it("neither spins nor misses a deadline further out than a timer can wait", () => {
    const DAY = 86_400_000;
    const deadline = MOUNTED_AT + 30 * DAY;
    const { result } = renderHook(() => useLiveWindow([deadline]));

    act(() => void vi.advanceTimersByTime(1_000));

    expect(result.current.getTime()).toBe(MOUNTED_AT);

    // Two stretches, each in its own `act`: the clock re-arms in an effect after the first wake.
    act(() => void vi.advanceTimersByTime(25 * DAY));

    expect(result.current.getTime()).toBeLessThan(deadline);

    act(() => void vi.advanceTimersByTime(5 * DAY));

    expect(result.current.getTime()).toBe(deadline);
  });

  /** Nothing ahead: the clock holds still rather than polling. */
  it("never moves when every deadline has passed", () => {
    const { result } = renderHook(() => useLiveWindow([MOUNTED_AT - 1_000]));

    act(() => void vi.advanceTimersByTime(UNDO_WINDOW_MS * 2));

    expect(result.current.getTime()).toBe(MOUNTED_AT);
  });
});
