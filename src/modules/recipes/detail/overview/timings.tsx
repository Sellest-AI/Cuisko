import { View, StyleSheet, ViewStyle } from "react-native";

import { HorizontalScrollView } from "@ui/horizontal-scroll-view";
import { Text } from "@ui/text";
import { theme } from "theme";

export type Timing = {
  emoji: string;
  label: string;
  value: string;
};

type Props = {
  timings: Timing[];
  style?: ViewStyle;
};

/**
 * Prep, cook and total, side by side.
 *
 * Its own label/value pair rather than `Stat`: the emoji sits beside the two lines instead of above
 * them, and the label is the quieter of the two here where `Stat` leads with it.
 */
export const Timings = ({ timings, style }: Props) => {
  const rows = timings.map((timing) => (
    <View key={timing.label} style={styles.timing}>
      <Text.H4>{timing.emoji}</Text.H4>
      <View style={styles.caption}>
        <Text.Sm numberOfLines={1} color={theme.colors.neutral.muted}>{timing.label}</Text.Sm>
        <Text.Base numberOfLines={1} color={theme.colors.neutral.base}>{timing.value}</Text.Base>
      </View>
    </View>
  ));

  /** Three fit the width; a fourth is what makes the row scroll. */
  if (timings.length > 3) {
    return (
      <HorizontalScrollView contentContainerStyle={[styles.timings, style]}>
        {rows}
      </HorizontalScrollView>
    );
  }

  return <View style={[styles.timings, style]}>{rows}</View>;
}

const styles = StyleSheet.create({
  timings: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[24],
  },
  timing: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[8],
  },
  caption: { flexShrink: 1 },
});
