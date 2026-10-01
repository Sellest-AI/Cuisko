import { renderHook } from "@testing-library/react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { describe, expect, it, vi } from "vitest";

import { useFollowToBottom } from "../useFollowToBottom";

/** A scroll event over a 600pt sheet and a 2000pt transcript, `y` points down. */
const scrolledTo = (y: number) =>
  ({
    nativeEvent: {
      contentOffset: { x: 0, y },
      contentSize: { width: 400, height: 2000 },
      layoutMeasurement: { width: 400, height: 600 },
    },
  }) as NativeSyntheticEvent<NativeScrollEvent>;

const setup = () => {
  const scrollToEnd = vi.fn();
  const hook = renderHook(() => useFollowToBottom({ current: { scrollToEnd } }));
  return { scrollToEnd, ...hook.result.current };
};

describe("useFollowToBottom", () => {
  it("follows a growing answer while the reader has not touched the list", () => {
    const { scrollToEnd, followIfPinned } = setup();

    followIfPinned();

    expect(scrollToEnd).toHaveBeenCalledWith({ animated: true });
  });

  it("stops following once the reader drags, so an answer streaming in cannot pull them back down", () => {
    const { scrollToEnd, followIfPinned, onScrollBeginDrag, onScroll } = setup();

    onScrollBeginDrag();
    onScroll(scrolledTo(400));
    followIfPinned();

    expect(scrollToEnd).not.toHaveBeenCalled();
  });

  it("follows again when the reader scrolls back to the end", () => {
    const { scrollToEnd, followIfPinned, onScrollBeginDrag, onScroll } = setup();

    onScrollBeginDrag();
    onScroll(scrolledTo(1400));
    followIfPinned();

    expect(scrollToEnd).toHaveBeenCalledTimes(1);
  });

  it("counts a thumb's width short of the end as the end, and no further", () => {
    const near = setup();
    near.onScrollBeginDrag();
    near.onScroll(scrolledTo(1400 - 48));
    near.followIfPinned();
    expect(near.scrollToEnd).toHaveBeenCalledTimes(1);

    const far = setup();
    far.onScrollBeginDrag();
    far.onScroll(scrolledTo(1400 - 49));
    far.followIfPinned();
    expect(far.scrollToEnd).not.toHaveBeenCalled();
  });

  it("follows again when a new question resumes it", () => {
    const { scrollToEnd, followIfPinned, onScrollBeginDrag, resume } = setup();

    onScrollBeginDrag();
    resume();
    followIfPinned();

    expect(scrollToEnd).toHaveBeenCalledTimes(1);
  });
});
