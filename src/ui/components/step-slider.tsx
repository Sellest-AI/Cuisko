import { StyleSheet, View, ViewStyle } from "react-native";

import { Pressable } from "@ui/pressable";
import { colors, theme } from "theme";
import { LinearGradient } from "expo-linear-gradient";

type Props = {
  value: number;
  /** Positions on the track, `1..max`. Every one is reachable in a single tap. */
  max?: number;
  onChange: (value: number) => void;
  style?: ViewStyle;
};

const DEFAULT_MAX = 8;
const TRACK_HEIGHT = 44;
const DOT_SIZE = 6;

/**
 * A discrete slider: a filled thumb that grows to the value, and a dot for every position past it.
 *
 * Every position is a tap target rather than a drag — the whole track is answerable with one thumb
 * press, and a household of six is not a number anyone should have to drag to. The dots are what
 * make the remaining positions visible as targets rather than as decoration on a bar.
 */
export const StepSlider = ({ value, max = DEFAULT_MAX, onChange, style }: Props) => (
  <View style={[styles.track, style]}>
    <LinearGradient
      colors={[colors.neutral.base, colors.neutral.muted]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[StyleSheet.absoluteFill, { opacity: 0.8, borderRadius: theme.radius.full }]}
    />
    <View style={[StyleSheet.absoluteFill, styles.thumbContainer]}>
      <View style={[styles.thumb, { width: `${(Math.min(value, max) / max) * 100}%` }]} />
    </View>
    {Array.from({ length: max }, (_, index) => {
      const position = index + 1;

      return (
        <Pressable
          key={position}
          animated={false}
          onPress={() => onChange(position)}
          style={styles.slot}
        >
          {position > value && <View style={styles.dot} />}
        </Pressable>
      );
    })}
  </View>
);

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
    opacity: 0.6,
  },
});
