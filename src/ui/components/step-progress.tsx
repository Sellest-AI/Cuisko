import { useEffect } from "react";
import { LayoutChangeEvent, StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { logCurve } from "@ui/utils";
import { colors, theme } from "theme";

type Props = {
  /** 1-based, matching the `N/5` the bar at the bottom reads. */
  step: number;
  total: number;
  /**
   * How `step / total` becomes a fill.
   *
   * `log` for steps the user walks at their own pace: the bar bends so the early ones look like
   * they buy the most ground. `linear` for steps advancing on a clock that already bends — the
   * loading screen times its own with `curvedStepDuration`, and bending here too would apply the
   * curve twice, putting the bar at 84% halfway through the wait.
   */
  curve?: "log" | "linear";
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
 * Share of the bar filled at `step`.
 *
 * On `log`, the first answers cost the least effort, so they should look like they buy the most
 * ground; the last steps then advance more slowly, which matches how they feel. Either way the bar
 * lands exactly full on the final step, however hard `logCurve` bends.
 */
const filledRatio = (step: number, total: number, curve: "log" | "linear") => {
  const ratio = Math.max(0, Math.min(step, total)) / Math.max(1, total);

  return curve === "log" ? logCurve(ratio) : ratio;
};

/** How far through the tunnel you are, as one continuous bar. */
export const StepProgress = ({
  step,
  total,
  curve = "log",
  color = colors.primary.base,
  trackColor = colors.primary.subtle,
  style,
}: Props) => {
  const trackWidth = useSharedValue(0);
  const progress = useSharedValue(filledRatio(step, total, curve));

  useEffect(() => {
    progress.value = withTiming(filledRatio(step, total, curve), {
      duration: FILL_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [step, total, curve, progress]);

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
