import { useEffect, useMemo } from "react";
import { StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { AnimatePresence, m } from "@ui/motion";
import { TiltedPhoto } from "@ui/tilted-photo";
import { theme } from "theme";

import { useStagedPhoto } from "../_hooks/useStagedPhoto";

/** How far the photo's bottom edge reaches down behind the bar. */
const PHOTO_TUCK = 28;
/** How far below its resting place the photo starts, and returns to, as it rises from the bar. */
const PHOTO_RISE = 32;

/** Travel before the pan is ours, so a tap on the photo is never read as a drag. */
const ACTIVATION_DISTANCE = 8;

/**
 * Let go further than this from where it rests, in any direction, and the photo is put away. A flick
 * counts too: it rarely covers much ground, so the speed of the release is read as well.
 */
const DISMISS_DISTANCE = 90;
const DISMISS_VELOCITY = 900;

/** How much of its opacity and size the photo has lost by the time it reaches the dismiss distance. */
const FADE_AT_DISMISS = 0.5;
const SHRINK_AT_DISMISS = 0.2;

type Props = {
  /** The height of the bar the photo rises from, which is where its bottom edge is measured from. */
  barHeight: number,
};

/**
 * The photo taken for the next question, standing behind the navigation bar.
 *
 * It rises from behind the bar and shows above its top edge, the bar's blur frosting the part that
 * is tucked in. It can be dragged anywhere, and dragged too far it is put away, the same as the
 * trash icon in the field: it fades and shrinks as it nears the distance, which says that letting
 * go there discards it, and springs back when let go short of it.
 *
 * Rendered before the field, so it is painted under it.
 */
export const StagedPhoto = ({ barHeight }: Props) => {
  const { photo, discard } = useStagedPhoto();
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);

  /**
   * Cleared when a photo arrives, not when it leaves: the exit animation plays after the discard,
   * and snapping the photo back up under it would show as a jump.
   */
  useEffect(() => {
    if (!photo) return;
    dragX.set(0);
    dragY.set(0);
  }, [photo, dragX, dragY]);

  const dragAway = useMemo(() => Gesture.Pan()
    .minDistance(ACTIVATION_DISTANCE)
    .onUpdate((event) => {
      dragX.set(event.translationX);
      dragY.set(event.translationY);
    })
    .onEnd((event) => {
      const isFarEnough = Math.hypot(event.translationX, event.translationY) > DISMISS_DISTANCE;
      const isFastEnough = Math.hypot(event.velocityX, event.velocityY) > DISMISS_VELOCITY;

      if (isFarEnough || isFastEnough) {
        scheduleOnRN(discard);
        return;
      }
      dragX.set(withSpring(0));
      dragY.set(withSpring(0));
    }), [dragX, dragY, discard]);

  const drag = useAnimatedStyle(() => {
    const progress = Math.min(Math.hypot(dragX.get(), dragY.get()) / DISMISS_DISTANCE, 1);

    return {
      opacity: 1 - progress * FADE_AT_DISMISS,
      transform: [
        { translateX: dragX.get() },
        { translateY: dragY.get() },
        { scale: 1 - progress * SHRINK_AT_DISMISS },
      ],
    };
  });

  return (
    <AnimatePresence>
      {photo && <m.View
        from={{ opacity: 0, scale: 0.6, translateY: PHOTO_RISE }}
        animate={{ opacity: 1, scale: 1, translateY: 0 }}
        exit={{ opacity: 0, scale: 0.6, translateY: PHOTO_RISE }}
        exitTransition={{ type: "timing", duration: 150 }}
        style={[styles.photo, { bottom: barHeight - PHOTO_TUCK }]}
      >
        <GestureDetector gesture={dragAway}>
          <Animated.View style={drag}>
            <TiltedPhoto uri={photo} />
          </Animated.View>
        </GestureDetector>
      </m.View>}
    </AnimatePresence>
  );
};

const styles = StyleSheet.create({
  photo: {
    position: "absolute",
    left: theme.spacing[12],
    transformOrigin: "bottom left",
  },
});
