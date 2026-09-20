import { ReactNode, useMemo } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";

type Props = {
  /** Called when the cook swipes towards the left, which asks for the tab after this one. */
  onNext?: () => void;
  /** Called when the cook swipes towards the right, which asks for the tab before this one. */
  onPrevious?: () => void;
  children: ReactNode;
};

/**
 * How far the finger has to travel sideways before the pan is ours, and how much vertical travel
 * hands it back. The tabs sit inside a vertical scroll container, and the two never both claim a
 * drag — but the container is the one deciding. On Android a native scroll view takes the touch
 * after the platform's own slop, about 8dp of vertical travel, and the gesture root then cancels
 * every handler still waiting. A sideways decision that took 20dp lost that race to any thumb
 * that arcs, which is every thumb. Ten is decided within a frame or two of leaving the slop;
 * twenty vertical keeps a scroll with a little drift from reading as a swipe on iOS, where the
 * scroll view does not cut in as early.
 */
const ACTIVATION_DISTANCE = 10;
const VERTICAL_TOLERANCE = 20;

/** A swipe counts when it goes far enough or fast enough — a flick rarely covers much ground. */
const SWIPE_DISTANCE = 60;
const SWIPE_VELOCITY = 500;

/**
 * The horizontal swipe that moves between a recipe's tabs.
 *
 * It wraps only the tab's content, never the frame: the tab row above scrolls sideways itself, and
 * the photo carries buttons. A pan over either would fight the thing it sits on. The neighbours are
 * not resolved here — the chrome owns the order, so it hands the two moves in already bound.
 */
export const TabSwipe = ({ onNext, onPrevious, children }: Props) => {
  const gesture = useMemo(() => Gesture.Pan()
    .activeOffsetX([-ACTIVATION_DISTANCE, ACTIVATION_DISTANCE])
    .failOffsetY([-VERTICAL_TOLERANCE, VERTICAL_TOLERANCE])
    .onEnd((event) => {
      const { translationX, velocityX } = event;
      const isSwipe = Math.abs(translationX) > SWIPE_DISTANCE || Math.abs(velocityX) > SWIPE_VELOCITY;
      if (!isSwipe) return;

      const move = translationX < 0 ? onNext : onPrevious;
      if (move) scheduleOnRN(move);
    }), [onNext, onPrevious]);

  return (
    <GestureDetector gesture={gesture}>
      {children}
    </GestureDetector>
  );
};
