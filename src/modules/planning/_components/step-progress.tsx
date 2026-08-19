import { useEffect } from "react";
import { LayoutChangeEvent, StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { colors, theme } from "theme";

type Props = {
  /** 1-based, matching the `N/5` the bar at the bottom reads. */
  step: number;
  total: number;
  /** The filled portion. Green on the grocery step, where the whole page changes tone. */
  color?: string;
  /** The track behind it. Lighter over the tinted steps than over the cream ones. */
  trackColor?: string;
  style?: ViewStyle;
};

const BAR_HEIGHT = 5;

/** How long the fill takes to travel to the new step, in ms. */
const FILL_MS = 800;

/**
 * How hard the curve bends. 0 would be linear; the higher it goes the more the first step takes
 * and the less is left for the last ones. At 5, step 1 of 5 fills 39% against a linear 20% —
 * enough to feel like a head start, not so much that the last two steps look stalled: they still
 * carry 12% and 10% of the bar between them.
 */
const CURVE = 5;

/**
 * Share of the bar filled at `step`, on a logarithmic curve rather than `step / total`.
 *
 * The first answers cost the least effort, so they should look like they buy the most ground.
 * The last steps then advance more slowly, which matches how they feel — and the bar still lands
 * exactly full on the final one, whatever `CURVE` is set to.
 */
const filledRatio = (step: number, total: number) => {
  const done = Math.max(0, Math.min(step, total)) / Math.max(1, total);

  return Math.log1p(CURVE * done) / Math.log1p(CURVE);
};

/** How far through the tunnel you are, as one continuous bar. */
export const StepProgress = ({
  step,
  total,
  color = colors.primary.base,
  trackColor = colors.primary.subtle,
  style,
}: Props) => {
  const trackWidth = useSharedValue(0);
  const progress = useSharedValue(filledRatio(step, total));

  useEffect(() => {
    progress.value = withTiming(filledRatio(step, total), {
      duration: FILL_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [step, total, progress]);

  /**
   * Width rather than `scaleX`, off a measured track: scaling would squash the rounded cap along
   * with the bar. The measurement is a shared value set outside the animation, so the fill lands
   * at its real width on the first layout instead of growing into it.
   */
  const fill = useAnimatedStyle(() => ({ width: trackWidth.value * progress.value }));

  const measure = ({ nativeEvent }: LayoutChangeEvent) => {
    trackWidth.value = nativeEvent.layout.width;
  };

  return (
    <View style={[styles.container, style]}>
      <View onLayout={measure} style={[styles.track, { backgroundColor: trackColor }]}>
        <Animated.View style={[styles.fill, fill, { backgroundColor: color }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing[16],
  },
  track: {
    height: BAR_HEIGHT,
    borderRadius: theme.radius.full,
  },
  fill: {
    height: "100%",
    borderRadius: theme.radius.full,
  },
});
