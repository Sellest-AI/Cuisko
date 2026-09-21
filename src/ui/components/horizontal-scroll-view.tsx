import { createContext, RefObject, useContext, useMemo, useRef } from "react";
import { ScrollView, ScrollViewProps } from "react-native";
import { Gesture, GestureDetector, GestureType } from "react-native-gesture-handler";
import { SharedValue, useSharedValue } from "react-native-reanimated";

type Swipe = {
  /** The pan every scroller blocks, so it may only activate once the scroller has let the drag go. */
  pan: RefObject<GestureType | undefined>;
  /** True while a finger that came down on a scroller is still down. Read by the pan at activation. */
  touchOnScroller: SharedValue<boolean>;
};

/**
 * The channel between a horizontal pan and the sideways scrollers drawn under it.
 *
 * A pan that activates cancels the touch of every plain scroll view beneath it, so a drag that
 * started over a row of macros switched the tab instead of scrolling the row. The pan cannot know
 * what sits under the finger; the scrollers have to say so, and they say it twice because no one
 * platform honours both:
 *
 * - A native gesture on the scroller that BLOCKS the pan. On Android this is the whole answer — the
 *   pan waits, the scroll view intercepts, and a waiting pan is never dispatched. On iOS it is not:
 *   the recognizer gesture-handler puts on a scroll view fails itself on release, which is the
 *   failure the pan was waiting for, and UIKit then lets the pan recognise the drag it already saw.
 * - A flag raised on touch down. The pan reads it when it activates — a step that comes at least a
 *   frame after the touch, so the flag is always set by then — and a swipe that began on a scroller
 *   is dropped when it ends, whatever the platform made of the relation.
 *
 * A ref for the pan rather than a registry of scrollers: the relation is written by the scroller at
 * its own mount, when the pan above it already has a handler, so nothing has to re-render the pan
 * for a new scroller to be honoured.
 */
const SwipeContext = createContext<Swipe | undefined>(undefined);

export const HorizontalScrollersProvider = SwipeContext.Provider;

/** What a pan needs to yield to the scrollers under it: its own ref to carry through `withRef`, and the flag. */
export const useSwipeScrollers = (): Swipe => {
  const pan = useRef<GestureType | undefined>(undefined);
  const touchOnScroller = useSharedValue(false);

  return useMemo(() => ({ pan, touchOnScroller }), [touchOnScroller]);
};

type Props = Omit<ScrollViewProps, "horizontal">;

/**
 * A `ScrollView` that scrolls sideways, and that any enclosing horizontal pan yields to.
 *
 * Outside a provider it is the plain scroller it wraps. Inside one, a drag that begins over this
 * row belongs to the row whether or not its content overflows — the alternative, a swipe that
 * works over short rows and not long ones, is a rule no cook could learn.
 */
export const HorizontalScrollView = (props: Props) => {
  const swipe = useContext(SwipeContext);

  const native = useMemo(() => {
    const gesture = Gesture.Native();
    return swipe ? gesture.blocksExternalGesture(swipe.pan) : gesture;
  }, [swipe]);

  const flag = (value: boolean) => () => {
    if (swipe) swipe.touchOnScroller.set(value);
  };

  return (
    <GestureDetector gesture={native}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        onTouchStart={flag(true)}
        onTouchEnd={flag(false)}
        onTouchCancel={flag(false)}
        {...props}
      />
    </GestureDetector>
  );
};
