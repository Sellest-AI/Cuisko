import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View, type ViewStyle } from "react-native";

import { theme } from "theme";
import { Text, TextNative } from "./text";

/** The percentage at the bar's right end: past the reference, with room to show how far. */
const GAUGE_MAX = 250;
const BAR_HEIGHT = 6;
const MARKER_HEIGHT = 14;

type Props = {
  label: string;
  /** Against the reference: 100 is exactly the reference. Clamped to the bar, never to the figure. */
  percent: number;
  style?: ViewStyle;
};

/**
 * One nutrient against its reference: the figure, a green-to-orange bar, and a mark where the
 * figure falls on it. The figure is printed as given — capping it is the caller's decision.
 */
export const NutrientGauge = ({ label, percent, style }: Props) => {
  const position = Math.min(Math.max(percent, 0), GAUGE_MAX) / GAUGE_MAX;

  return (
    <View style={[styles.container, style]}>
      <TextNative style={styles.figure}>
        <Text.H4>{Math.round(percent)}</Text.H4>
        <Text.Base weight={700}>%</Text.Base>
      </TextNative>
      <View style={styles.track}>
        <LinearGradient
          style={styles.bar}
          colors={["#d6cc18", "#0DD60D", "#EBCB2A", "#FF6B0F"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        />
        <View style={[styles.marker, { left: `${position * 100}%` }]} />
      </View>
      <Text.Base style={styles.label} numberOfLines={1}>{label}</Text.Base>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { width: 76, alignItems: "center", gap: theme.spacing[6] },
  figure: { textAlign: "center", color: theme.colors.neutral.base },
  track: { width: "100%", height: MARKER_HEIGHT, justifyContent: "center" },
  bar: { height: BAR_HEIGHT, borderRadius: theme.radius.full },
  marker: {
    position: "absolute",
    width: 2,
    height: MARKER_HEIGHT,
    marginLeft: -1,
    borderRadius: 1,
    backgroundColor: theme.colors.neutral.base,
  },
  label: { color: theme.colors.neutral.muted },
});
