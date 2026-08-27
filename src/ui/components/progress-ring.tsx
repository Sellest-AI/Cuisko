import { StyleSheet, View, ViewStyle } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { colors, theme } from "theme";

type Props = {
  /** 0 → 1. Clamped, and drawn exactly as given — the ring animates nothing on its own. */
  progress: number;
  size?: number;
  strokeWidth?: number;
  /** Sits in the middle of the ring, centred in both axes. */
  children?: React.ReactNode;
  style?: ViewStyle;
};

const DEFAULT_SIZE = 132;
const DEFAULT_STROKE_WIDTH = 8;

/**
 * A circular bar: a full track, and an arc over it that grows clockwise from the top.
 *
 * Drawn with `strokeDasharray` rather than an arc path, because a path has to be recomputed for
 * every value and degenerates at both ends — a zero-length arc and a full circle are the two cases
 * an arc command cannot express, and they are exactly the two this draws most often. A dash offset
 * has neither problem and interpolates linearly.
 *
 * The ring holds no clock and no timer. Whatever is counting hands it a number, which is what lets
 * an estimated wait, a real one and a test all drive the same component.
 */
export const ProgressRing = ({
  progress,
  size = DEFAULT_SIZE,
  strokeWidth = DEFAULT_STROKE_WIDTH,
  children,
  style,
}: Props) => {
  /** The stroke straddles the radius, so the circle is inset by half of it or it clips its own edge. */
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  /** A caller mid-animation can overshoot either end; the ring refuses rather than drawing a gap. */
  const filled = Math.min(Math.max(progress, 0), 1);

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg
        width={size}
        height={size}
        /** Puts 0 at twelve o'clock; without it the arc starts at three and reads as off-centre. */
        style={{ transform: [{ rotate: "-90deg" }] }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.border.default}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.primary.base}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - filled)}
        />
      </Svg>
      {children !== undefined && (
        <View style={styles.label} pointerEvents="none">
          {children}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  /** Over the ring, not inside it — the arc and the label share a box and neither lays the other out. */
  label: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[16],
  },
});
