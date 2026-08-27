import { View, StyleSheet, ScrollView, ViewStyle } from "react-native";

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
  const Component = timings.length > 3 ? ScrollView : View;

  const componentProps = timings.length > 3 ?
    { horizontal: true, showsHorizontalScrollIndicator: false } :
    { style: [styles.timings, style] };

  return (
    <Component
      {...componentProps}
      contentContainerStyle={[
        styles.timings,
        style
      ]}
    >
      {timings.map((timing) => (
        <View key={timing.label} style={styles.timing}>
          <Text.H4>{timing.emoji}</Text.H4>
          <View style={styles.caption}>
            <Text.Sm numberOfLines={1} color={theme.colors.neutral.muted}>{timing.label}</Text.Sm>
            <Text.Base numberOfLines={1} color={theme.colors.neutral.base}>{timing.value}</Text.Base>
          </View>
        </View>
      ))}
    </Component>
  );
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
