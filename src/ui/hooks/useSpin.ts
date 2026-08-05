import { useEffect } from "react";
import {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const REVOLUTION_MS = 1200;

/**
 * Continuous rotation while `active`, parked at 0 when it stops.
 *
 * It is deliberately ignorant of *why* something spins — a loading button, a refresh
 * affordance and a standalone spinner all want the same 1.2s linear revolution, and none of
 * them should own an animation loop. Returns a style for an `Animated.View` wrapper rather
 * than a component, so the thing being spun stays whatever the caller wants it to be.
 */
export const useSpin = (active: boolean) => {
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      cancelAnimation(rotation);
      // Snap rather than unwind: easing back to 0 rotates *backwards*, which reads as an
      // error. Callers cross-fade or morph at this moment anyway, so the jump is invisible.
      rotation.value = 0;
      return;
    }

    rotation.value = withRepeat(
      withTiming(360, { duration: REVOLUTION_MS, easing: Easing.linear }),
      -1,
    );

    return () => cancelAnimation(rotation);
  }, [active, rotation]);

  return useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
};
