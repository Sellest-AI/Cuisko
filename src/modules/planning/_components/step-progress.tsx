import { StyleSheet, View, ViewStyle } from "react-native";

import { colors, theme } from "theme";

type Props = {
  /** 1-based, matching the `N/5` the bar at the bottom reads. */
  step: number;
  total: number;
  /** Filled segments. Green on the grocery step, where the whole page changes tone. */
  color?: string;
  /** Unfilled ones. Lighter over the tinted steps than over the cream ones. */
  trackColor?: string;
  style?: ViewStyle;
};

const SEGMENT_HEIGHT = 5;

/**
 * How far through the tunnel you are, as one segment per step.
 *
 * Segments rather than a continuous bar because the steps are countable and few: five discrete
 * questions read as five things to answer, where a filling bar reads as an unknown wait.
 */
export const StepProgress = ({
  step,
  total,
  color = colors.primary.base,
  trackColor = colors.primary.subtle,
  style,
}: Props) => (
  <View style={[styles.container, style]}>
    {Array.from({ length: total }, (_, index) => (
      <View
        key={index}
        style={[styles.segment, { backgroundColor: index < step ? color : trackColor }]}
      />
    ))}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[8],
    paddingHorizontal: theme.spacing[16],
  },
  segment: {
    flex: 1,
    height: SEGMENT_HEIGHT,
    borderRadius: theme.radius.full,
  },
});
