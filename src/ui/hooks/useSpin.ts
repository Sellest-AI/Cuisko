import { useIsFocused } from "expo-router";
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

type Options = {
  /** Milliseconds for one full turn. Defaults to `REVOLUTION_MS`. */
  revolutionMs?: number;
};

/**
 * Continuous rotation while `active`, parked at 0 when it stops.
 *
 * It is deliberately ignorant of *why* something spins — a loading button, a refresh
 * affordance and a standalone spinner all want the same linear revolution, and none of
 * them should own an animation loop. Returns a style for an `Animated.View` wrapper rather
 * than a component, so the thing being spun stays whatever the caller wants it to be.
 *
 * **Parked while its screen is not focused.** A screen under another one stays mounted, and its
 * spinner kept turning on the UI thread for nobody — today's day marker turns for as long as the
 * planning list is open. Outside any screen (the navigation bar, beside the navigator) the router
 * answers focused, so those spin as asked.
 */
export const useSpin = (active: boolean, options?: Options) => {
  const rotation = useSharedValue(0);
  const revolutionMs = options?.revolutionMs ?? REVOLUTION_MS;
  const isFocused = useIsFocused();
  const isSpinning = active && isFocused;

  useEffect(() => {
    if (!isSpinning) {
      cancelAnimation(rotation);
      // Snap rather than unwind: easing back to 0 rotates *backwards*, which reads as an
      // error. Callers cross-fade or morph at this moment anyway, so the jump is invisible.
      rotation.value = 0;
      return;
    }

    rotation.value = withRepeat(
      withTiming(360, { duration: revolutionMs, easing: Easing.linear }),
      -1,
    );

    return () => cancelAnimation(rotation);
  }, [isSpinning, revolutionMs, rotation]);

  return useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
};
