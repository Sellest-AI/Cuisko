import { useEffect } from "react";
import { LayoutChangeEvent, StyleSheet, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import * as Haptics from "expo-haptics";

import { colors, theme } from "theme";

type Props = {
  value: number;
  /** Positions on the track, `1..max`. Every one is reachable in a single tap or drag. */
  max?: number;
  onChange: (value: number) => void;
  style?: ViewStyle;
};

const DEFAULT_MAX = 8;
const TRACK_HEIGHT = 44;
const DOT_SIZE = 6;
const DOT_OPACITY = 0.6;
const ANIMATION_DURATION = 100;

/**
 * One position's marker, hidden once the thumb has covered it.
 *
 * Driven by the same shared value as the thumb rather than by the `value` prop, because the prop
 * only comes back after the gesture has round-tripped through the parent: a dot reading it would
 * vanish before the thumb reached it, so the two halves of the track would disagree mid-drag.
 */
const Dot = ({ position, progress }: { position: number; progress: SharedValue<number> }) => {
  const style = useAnimatedStyle(() => ({
    opacity: position > progress.value ? DOT_OPACITY : 0,
  }));

  return (
    <View pointerEvents="none" style={styles.slot}>
      <Animated.View style={[styles.dot, style]} />
    </View>
  );
};

export const StepSlider = ({
  value,
  max = DEFAULT_MAX,
  onChange,
  style,
}: Props) => {
  const trackWidth = useSharedValue(0);

  // Smooth visual position.
  const animatedValue = useSharedValue(value);

  // Discrete value currently targeted.
  const targetValue = useSharedValue(value);

  const handleLayout = (event: LayoutChangeEvent) => {
    trackWidth.value = event.nativeEvent.layout.width;
  };

  /**
   * The position under the finger.
   *
   * The track is `max` equal slots — the geometry the dots are already laid out on, and the one
   * the thumb's `value / max` width fills to. So the slot the finger is over *is* the value, and
   * the fill edge lands under the finger. Mapping across `max - 1` intervals instead would make
   * the two disagree everywhere but the right end, and shrink position 1's reach to half a slot.
   */
  const getValueFromX = (x: number) => {
    "worklet";

    if (trackWidth.value <= 0) {
      return value;
    }

    const slot = Math.ceil((x / trackWidth.value) * max);

    return Math.max(1, Math.min(max, slot));
  };

  const updateValueOnRN = (nextValue: number) => {
    if (nextValue === value) {
      return;
    }

    // Very subtle tick when crossing a discrete step.
    void Haptics.selectionAsync();

    onChange(nextValue);
  };

  const setSliderValue = (nextValue: number) => {
    "worklet";

    if (nextValue === targetValue.value) {
      return;
    }

    targetValue.value = nextValue;

    animatedValue.value = withTiming(nextValue, {
      duration: ANIMATION_DURATION,
    });

    scheduleOnRN(updateValueOnRN, nextValue);
  };

  /**
   * Follow `value` when it moves on its own.
   *
   * The shared values seed once, so without this the thumb would ignore every change that did not
   * come from a finger — a serving count that resolves after mount, a reset, a parent clamping the
   * number. Worse, `setSliderValue`'s early return would then treat the stale position as current
   * and refuse to animate back to it, leaving a thumb no drag could repair.
   *
   * A no-op when the gesture caused the change: `setSliderValue` has already moved `targetValue`
   * by the time the new prop arrives, so the two agree and nothing here fights the animation.
   */
  useEffect(() => {
    if (value === targetValue.value) return;

    targetValue.value = value;
    animatedValue.value = withTiming(value, { duration: ANIMATION_DURATION });
  }, [value, targetValue, animatedValue]);

  const gesture = Gesture.Pan()
    .onBegin((event) => {
      const nextValue = getValueFromX(event.x);

      setSliderValue(nextValue);
    })
    .onUpdate((event) => {
      const nextValue = getValueFromX(event.x);

      setSliderValue(nextValue);
    });

  const thumbStyle = useAnimatedStyle(() => ({
    width: `${(animatedValue.value / max) * 100}%`,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View
        onLayout={handleLayout}
        style={[styles.track, style]}
      >
        <LinearGradient
          colors={[
            colors.neutral.base,
            colors.neutral.muted,
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: 0.8,
              borderRadius: theme.radius.full,
            },
          ]}
        />

        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.thumbContainer,
          ]}
        >
          <Animated.View
            style={[
              styles.thumb,
              thumbStyle,
            ]}
          />
        </Animated.View>

        {Array.from({ length: max }, (_, index) => (
          <Dot
            key={index + 1}
            position={index + 1}
            progress={animatedValue}
          />
        ))}
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    alignItems: "center",
    height: TRACK_HEIGHT,
    backgroundColor: colors.neutral.elevated,
    borderRadius: theme.radius.full,
    padding: theme.spacing[4],
    overflow: "hidden",
  },

  thumbContainer: {
    right: theme.spacing[8],
  },

  thumb: {
    position: "absolute",
    left: 4,
    top: 4,
    bottom: 4,
    borderRadius: theme.radius.full,
    backgroundColor: colors.neutral.foreground,
    borderWidth: 2,
    borderColor: colors.border.default,
  },

  slot: {
    flex: 1,
    height: TRACK_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },

  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: theme.radius.full,
    backgroundColor: colors.neutral.subtle,
  },
});
