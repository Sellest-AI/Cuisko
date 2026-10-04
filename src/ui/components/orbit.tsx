import { type ReactNode, useEffect } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { theme } from "theme";

/**
 * A glyph on two discs, with things circling it: a wait that has somewhere to come from.
 *
 * Timings are the reference video's, measured frame by frame (30 fps), in ms from mount:
 *
 *     0–130     outer disc fades in (the sheet carrying it is sliding up natively meanwhile)
 *     130–230   inner disc fades in
 *     0 / 170 / 230   satellites pop in, in their order, scale 0 → 1 with a slight overshoot
 *     230       the centre pops in
 *     then      the ring turns clockwise, one turn per ORBIT_MS, until `state` changes
 *
 * `dismissed` is the way out, and an anticipation rather than a fade: the ring freezes where it is,
 * each satellite swells to 1.15 and then collapses to nothing as it fades, ~60 ms after the one
 * before it. The centre is the caller's (`center`), so a glyph that morphs (a `MorphIcon` switching
 * from share to X) morphs in place while the satellites go.
 *
 * Satellites keep their own tilt as the ring turns: each counter-rotates by the ring's angle.
 */

/** A thing on the ring: where it starts (degrees, 0 = right, clockwise) and how it leans. */
export type OrbitSatellite = { key: string; node: ReactNode; angle: number; tilt?: number };

type Props = {
  center: ReactNode;
  satellites: OrbitSatellite[];
  /** The outer disc's diameter. Satellites sit on its edge. */
  size: number;
  /** The satellites' own box, so they can be centred on the edge. */
  satelliteSize: number;
  state: "orbiting" | "dismissed";
  style?: ViewStyle;
};

/** One turn every 30 s: ~12°/s, the reference's ~25° over two seconds. */
const ORBIT_MS = 30_000;

/** When each satellite appears, by its index, from the reference. Past the third, every 60 ms. */
const SATELLITE_DELAYS = [0, 170, 230];
const CENTER_DELAY = 230;

const POP = { damping: 11, stiffness: 240, mass: 0.6 };

const ANTICIPATE_MS = 120;
const COLLAPSE_MS = 180;
const DISMISS_STAGGER_MS = 60;

const INNER_RATIO = 0.56;
const OUTER_OPACITY = 0.55;

const _delayOf = (index: number) => SATELLITE_DELAYS[index] ?? SATELLITE_DELAYS.at(-1)! + (index - 2) * 60;

const Satellite = ({
  satellite,
  index,
  ring,
  radius,
  satelliteSize,
  dismissed,
}: {
  satellite: OrbitSatellite;
  index: number;
  ring: SharedValue<number>;
  radius: number;
  satelliteSize: number;
  dismissed: boolean;
}) => {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (!dismissed) {
      scale.value = withDelay(_delayOf(index), withSpring(1, POP));
      return;
    }

    const delay = index * DISMISS_STAGGER_MS;
    scale.value = withDelay(
      delay,
      withSequence(
        withTiming(1.15, { duration: ANTICIPATE_MS, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: COLLAPSE_MS, easing: Easing.in(Easing.cubic) }),
      ),
    );
    opacity.value = withDelay(delay + ANTICIPATE_MS, withTiming(0, { duration: COLLAPSE_MS }));
  }, [dismissed, index, opacity, scale]);

  const radians = (satellite.angle * Math.PI) / 180;
  const left = radius + radius * Math.cos(radians) - satelliteSize / 2;
  const top = radius + radius * Math.sin(radians) - satelliteSize / 2;

  // Read out as a number BEFORE the worklet: a worklet copies everything it closes over to the UI
  // thread, and `satellite` carries `node`, a React element whose FiberNode cannot be copied.
  const tilt = satellite.tilt ?? 0;

  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ rotate: `${tilt - ring.value}deg` }, { scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.satellite, { left, top, width: satelliteSize, height: satelliteSize }, animated]}>
      {satellite.node}
    </Animated.View>
  );
};

export const Orbit = ({ center, satellites, size, satelliteSize, state, style }: Props) => {
  const ring = useSharedValue(0);
  const outer = useSharedValue(0);
  const inner = useSharedValue(0);
  const centerScale = useSharedValue(0);

  const dismissed = state === "dismissed";

  useEffect(() => {
    // The outer disc settles half-seen: the inner one, at full strength, is what reads as a step darker.
    outer.value = withTiming(OUTER_OPACITY, { duration: 130 });
    inner.value = withDelay(130, withTiming(1, { duration: 100 }));
    centerScale.value = withDelay(CENTER_DELAY, withSpring(1, POP));
  }, [centerScale, inner, outer]);

  useEffect(() => {
    if (dismissed) {
      // Frozen where it stands, not wound back: the satellites leave from where the cook saw them.
      cancelAnimation(ring);
      return;
    }
    ring.value = withRepeat(
      withTiming(ring.value + 360, { duration: ORBIT_MS, easing: Easing.linear }),
      -1,
      false,
    );
  }, [dismissed, ring]);

  const ringStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${ring.value}deg` }] }));
  const outerStyle = useAnimatedStyle(() => ({ opacity: outer.value }));
  const innerStyle = useAnimatedStyle(() => ({ opacity: inner.value }));
  const centerStyle = useAnimatedStyle(() => ({ transform: [{ scale: centerScale.value }] }));

  const innerSize = size * INNER_RATIO;

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Animated.View style={[styles.disc, styles.outer, { borderRadius: size / 2 }, outerStyle]} />
      <Animated.View
        style={[
          styles.disc,
          styles.inner,
          { width: innerSize, height: innerSize, borderRadius: innerSize / 2, left: (size - innerSize) / 2, top: (size - innerSize) / 2 },
          innerStyle,
        ]}
      />
      <Animated.View style={[StyleSheet.absoluteFill, styles.centered, centerStyle]}>{center}</Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, ringStyle]}>
        {satellites.map((satellite, index) => (
          <Satellite
            key={satellite.key}
            satellite={satellite}
            index={index}
            ring={ring}
            radius={size / 2}
            satelliteSize={satelliteSize}
            dismissed={dismissed}
          />
        ))}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  disc: { position: "absolute" },
  outer: { top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.colors.neutral.subtle },
  inner: { backgroundColor: theme.colors.neutral.subtle },
  centered: { alignItems: "center", justifyContent: "center" },
  satellite: {
    position: "absolute",
    shadowColor: "black",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
