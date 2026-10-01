import { useCallback, useRef, type RefObject } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

type Scroller = { scrollToEnd: (options: { animated: boolean }) => void };

/** How far from the end still counts as being at it — a thumb rests a few points short of exact. */
const BOTTOM_THRESHOLD = 48;

const isNearBottom = ({ contentOffset, contentSize, layoutMeasurement }: NativeScrollEvent) =>
  contentSize.height - layoutMeasurement.height - contentOffset.y <= BOTTOM_THRESHOLD;

/**
 * Keeps the transcript pinned to its end while an answer streams, until the reader takes over.
 *
 * Following is not unconditional: an answer changes the content height many times a second, and a
 * `scrollToEnd` on each one pulls the list out from under a reader who is scrolling up to reread —
 * on Android's form sheet that fight ends with the sheet taking the drag and closing. So a drag
 * stops the following, and reaching the bottom again (by hand, or by `resume`) starts it.
 *
 * The flag is a ref because it is read inside native event callbacks and changes with every drag;
 * nothing on screen depends on it, so a state update would only re-render the whole transcript.
 */
export const useFollowToBottom = (scroller: RefObject<Scroller | null>) => {
  const following = useRef(true);

  const followIfPinned = useCallback(() => {
    if (following.current) scroller.current?.scrollToEnd({ animated: true });
  }, [scroller]);

  /** Only ever switches following on: a programmatic scroll passes through offsets that are not the end. */
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isNearBottom(event.nativeEvent)) following.current = true;
  }, []);

  const onScrollBeginDrag = useCallback(() => {
    following.current = false;
  }, []);

  /** For a new question: its answer is what the reader wants to see, wherever they had scrolled to. */
  const resume = useCallback(() => {
    following.current = true;
  }, []);

  return { followIfPinned, onScroll, onScrollBeginDrag, resume };
};
