import { StyleSheet } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { theme } from "theme";

/**
 * The durations the knob's travel spans. Below the first the knob stays at the top of its band,
 * past the second at the bottom: the dial reads short or long at a glance, it is not a clock.
 */
const SHORTEST_MINUTES = 10;
const LONGEST_MINUTES = 60;

/** Measured from the disc the dial rings, so the three stay concentric if the disc is resized. */
const TICKS_RADIUS = 115;
const TICKS_WIDTH = 10;
const HAND_RADIUS = 136;
const HAND_WIDTH = 6;
const KNOB_RADIUS = 9;

/** Room for the outermost stroke and the knob, which both overhang the hand's radius. */
const HALF = HAND_RADIUS + KNOB_RADIUS;
const SIZE = HALF * 2;

type Props = {
  minutes: number;
  /** The radius of the disc the dial sits around; the dial is centred on the disc's centre. */
  discRadius: number;
  /**
   * The highest and lowest the knob may sit, in points below the disc's centre (negative is
   * above). The card sets it from its own height, because only the card knows where it clips.
   */
  knobBand: { top: number; bottom: number };
};

/** A point on a circle centred in the canvas, at `angle` radians clockwise from twelve o'clock. */
const _pointAt = (radius: number, angle: number) => ({
  x: HALF + radius * Math.sin(angle),
  y: HALF - radius * Math.cos(angle),
});

/**
 * The two rings around the total: a scale of ticks, and a hand that sweeps from twelve o'clock
 * down the right side to a knob.
 *
 * The knob's height, not its angle, is what the duration sets: a clock face would push anything
 * past twenty minutes below the card, where it is clipped. So a duration picks a height inside
 * `knobBand`, and the angle is whatever puts the hand's circle at that height.
 */
export const TimingsDial = ({ minutes, discRadius, knobBand }: Props) => {
  const progress = Math.min(
    Math.max((minutes - SHORTEST_MINUTES) / (LONGEST_MINUTES - SHORTEST_MINUTES), 0),
    1,
  );
  const knobY = knobBand.top + progress * (knobBand.bottom - knobBand.top);
  /** `y = -r·cos(angle)`, solved on the right half; clamped so a short card cannot leave the circle. */
  const angle = Math.acos(Math.min(Math.max(-knobY / HAND_RADIUS, -1), 1));

  const start = _pointAt(HAND_RADIUS, 0);
  const end = _pointAt(HAND_RADIUS, angle);

  return (
    <Svg
      width={SIZE}
      height={SIZE}
      pointerEvents="none"
      style={[styles.canvas, { top: discRadius - HALF, left: discRadius - HALF }]}
    >
      <Circle
        cx={HALF}
        cy={HALF}
        r={TICKS_RADIUS}
        fill="none"
        stroke={theme.colors.primary.elevated}
        strokeOpacity={0.6}
        strokeWidth={TICKS_WIDTH}
        strokeDasharray="2.5 3.5"
      />
      <Circle
        cx={HALF}
        cy={HALF}
        r={HAND_RADIUS}
        fill="none"
        stroke={theme.colors.primary.subtle}
        strokeOpacity={0.5}
        strokeWidth={HAND_WIDTH}
      />
      {/* Never past six o'clock, so the short way round is always the one wanted. */}
      <Path
        d={`M ${start.x} ${start.y} A ${HAND_RADIUS} ${HAND_RADIUS} 0 0 1 ${end.x} ${end.y}`}
        fill="none"
        stroke={theme.colors.primary.base}
        strokeWidth={HAND_WIDTH}
        strokeLinecap="round"
      />
      <Circle cx={end.x} cy={end.y} r={KNOB_RADIUS} fill={theme.colors.primary.base} />
    </Svg>
  );
};

const styles = StyleSheet.create({
  canvas: { position: "absolute" },
});
