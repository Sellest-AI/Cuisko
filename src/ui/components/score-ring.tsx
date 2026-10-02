import type { ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { Circle } from "react-native-svg";

type Props = {
  /** 0-100: how much of the ring is filled. Outside that range it is clamped. */
  score: number;
  /** The ring's outer diameter. */
  size: number;
  strokeWidth: number;
  /** The empty part of the ring. */
  trackColor: string;
  /** The filled part. */
  fillColor: string;
  /** Drawn in the middle: the heart, usually. */
  children?: ReactNode;
  style?: ViewStyle;
};

/** A ring that fills clockwise from twelve o'clock in proportion to a score, around its children. */
export const ScoreRing = ({ score, size, strokeWidth, trackColor, fillColor, children, style }: Props) => {
  const filled = Math.min(Math.max(score, 0), 100) / 100;
  /** Inset by half the stroke, so the ring's outer edge meets the canvas edge instead of being cut. */
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const centre = size / 2;

  return (
    <View style={[styles.ring, { width: size, height: size }, style]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={centre} cy={centre} r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        {/* Rotated a quarter turn back, so the fill starts at twelve o'clock and runs clockwise. */}
        {filled > 0 && (
          <Circle
            cx={centre}
            cy={centre}
            r={radius}
            fill="none"
            stroke={fillColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - filled)}
            transform={`rotate(-90 ${centre} ${centre})`}
          />
        )}
      </Svg>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  ring: { justifyContent: "center", alignItems: "center" },
});
