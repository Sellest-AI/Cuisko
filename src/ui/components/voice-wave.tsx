import { useId, useState } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedProps,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { theme } from "theme";

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** How many samples span the row — the seconds of voice the wave remembers, and its resolution. */
const SAMPLE_COUNT = 100;

/** How long a sample takes to cross one slot, in milliseconds: the scroll speed. */
const SAMPLE_MS = 25;

/**
 * The lowest share of the current level a sample may draw at. The recognizer reports loudness, not
 * the sound itself, and loudness moves slowly — drawn as is, a voice was a smooth, flat band. So
 * each sample takes a random share of the level between this and 1: a loud voice draws tall spikes
 * of differing heights, a quiet one small ones, and silence stays flat, since any share of 0 is 0.
 */
const TEXTURE_FLOOR = 0.3;

/** Half-height of a silent wave, as a share of the row — a hairline, so it reads as listening. */
const REST_SCALE = 0.04;

/** How many slots from the left edge a sample takes to shrink back to a point. */
const FALL_SLOTS = 17;

/**
 * How many slots from each edge the fill takes to fade from transparent to opaque. Their own
 * numbers, apart from the tapers: the wave can dissolve into the bar before it narrows to a point.
 */
const FADE_LEFT_SLOTS = 33;
const FADE_RIGHT_SLOTS = 17;

/** How many slots from the right edge a sample takes to grow to its full height. */
const RISE_SLOTS = 17;

/** 0 → 1 with a flat start and end, so neither taper has a visible corner. */
const _smoothstep = (edge: number) => {
  "worklet";
  const t = Math.min(Math.max(edge, 0), 1);
  return t * t * (3 - 2 * t);
};

type Size = { width: number, height: number };

/**
 * The wave's outline: a smooth curve through every sample's height above the centre line, then the
 * same curve mirrored below it, closed.
 *
 * Each sample sits at its slot's centre, shifted left by the slide in progress, so the shape moves
 * continuously. Both ends are scaled down to a point: over `RISE_SLOTS` on the right, so a loud word
 * grows into the row rather than appearing on its edge, and over `FALL_SLOTS` on the left, so it
 * shrinks away rather than being cut off by it. The curve goes through the midpoints between
 * samples with each sample as the control point — smooth, and never overshooting a sample.
 */
const _outline = (samples: number[], progress: number, size: Size) => {
  "worklet";
  const slot = size.width / SAMPLE_COUNT;
  const centre = size.height / 2;

  const xs: number[] = [];
  const amplitudes: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    const slots = i + 0.5 - progress;
    const rise = _smoothstep((SAMPLE_COUNT - slots) / RISE_SLOTS);
    const fall = _smoothstep(slots / FALL_SLOTS);
    const level = REST_SCALE + (1 - REST_SCALE) * (samples[i] ?? 0);

    xs.push(slots * slot);
    amplitudes.push(centre * level * rise * fall);
  }

  const edge = (sign: 1 | -1, order: number[]) => {
    let d = "";
    for (let k = 0; k < order.length - 1; k++) {
      const i = order[k] ?? 0;
      const j = order[k + 1] ?? 0;
      const x = xs[i] ?? 0;
      const y = centre - sign * (amplitudes[i] ?? 0);
      const midX = (x + (xs[j] ?? 0)) / 2;
      const midY = (y + centre - sign * (amplitudes[j] ?? 0)) / 2;
      d += ` Q ${x} ${y} ${midX} ${midY}`;
    }
    const last = order[order.length - 1] ?? 0;
    return `${d} L ${xs[last] ?? 0} ${centre - sign * (amplitudes[last] ?? 0)}`;
  };

  const forward = samples.map((_, i) => i);
  const backward = [...forward].reverse();

  return `M ${xs[0] ?? 0} ${centre}${edge(1, forward)}${edge(-1, backward)} Z`;
};

type Props = {
  /** How loud the input is right now, 0 to 1. A shared value: it is read on the UI thread. */
  level: SharedValue<number>,
  color?: string,
  style?: ViewStyle,
}

/**
 * A voice drawn over time, as one shape: every `SAMPLE_MS` the current level enters on the
 * right edge, rises to its height as it slides left, and shrinks back to a point at the left edge.
 *
 * One path rather than a view per sample, rebuilt on the UI thread every frame. A frame callback
 * slides it by the fraction of a slot elapsed since the last sample, and shifts the history by one
 * at each whole slot; one extra sample waits past the right edge so the newest slides in.
 *
 * The fill is also faded to transparent at both ends, over `FADE_LEFT_SLOTS` and
 * `FADE_RIGHT_SLOTS` — a gradient on the fill, reaching transparent exactly at the edge.
 */
export const VoiceWave = ({ level, color = theme.colors.primary.base, style }: Props) => {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  // `useId` answers with colons, which a `url(#…)` reference does not accept on every platform.
  const fadeId = `voice-wave-fade-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const history = useSharedValue<number[]>(Array.from({ length: SAMPLE_COUNT + 1 }, () => 0));
  /** How far into the current slot the wave has slid, 0 to 1. */
  const progress = useSharedValue(0);

  useFrameCallback(({ timeSincePreviousFrame }) => {
    const next = progress.get() + (timeSincePreviousFrame ?? 0) / SAMPLE_MS;
    if (next < 1) return progress.set(next);

    const current = level.get() * (TEXTURE_FLOOR + (1 - TEXTURE_FLOOR) * Math.random());
    history.modify((samples) => {
      "worklet";
      samples.shift();
      samples.push(current);
      return samples;
    });
    // Modulo, so a dropped frame costs a skipped slot rather than a wave that lags behind for good.
    progress.set(next % 1);
  });

  const wave = useAnimatedProps(() => ({ d: _outline(history.get(), progress.get(), size) }));

  return (
    <View
      style={[styles.container, style]}
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      {size.width > 0 && <Svg width={size.width} height={size.height}>
        <Defs>
          <LinearGradient id={fadeId} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={color} stopOpacity={0} />
            <Stop offset={FADE_LEFT_SLOTS / SAMPLE_COUNT} stopColor={color} stopOpacity={1} />
            <Stop offset={1 - FADE_RIGHT_SLOTS / SAMPLE_COUNT} stopColor={color} stopOpacity={1} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <AnimatedPath animatedProps={wave} fill={`url(#${fadeId})`} />
      </Svg>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignSelf: "stretch",
    overflow: "hidden",
  },
});
