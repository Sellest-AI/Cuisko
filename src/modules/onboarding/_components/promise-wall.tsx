import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { Text } from "@ui/text";
import { colors, theme } from "theme";

export type PromiseTone = "primary" | "secondary" | "danger" | "plain";

type PromiseChip = { id: string; emoji: string; label: string; tone: PromiseTone };

/** Slow enough to read a chip as it passes, quick enough that the wall reads as alive. */
const DRIFT_PER_SECOND = 20;
const GAP = theme.spacing[16];
/** Copies of a row laid end to end: enough to cover the widest phone while one copy slides off. */
const COPIES = 3;

const TONE_BACKGROUND: Record<PromiseTone, string> = {
  primary: colors.primary.subtle,
  secondary: colors.secondary.subtle,
  danger: colors.danger.base,
  plain: colors.neutral.subtle,
};

const TONE_FOREGROUND: Record<PromiseTone, string> = {
  primary: colors.primary.base,
  secondary: colors.secondary.base,
  danger: colors.danger.foreground,
  plain: colors.foreground,
};

/**
 * What the app promises, as a wall of chips running off both edges, each row set back from the one
 * above and drifting the other way from its neighbours.
 *
 * In the app's own materials rather than the reference's flat colours: the frosted card surface with
 * its border and soft shadow, tinted with the tones' pastel `subtle`. Still for anyone who asked the
 * phone for less motion.
 */
export const PromiseWall = ({ rows }: { rows: readonly (readonly PromiseChip[])[] }) => (
  <View style={styles.wall}>
    {rows.map((chips, index) => (
      <Row key={index} chips={chips} isReversed={index % 2 === 1} setBack={(index % 2) * 56 + index * 12} />
    ))}
  </View>
);

/**
 * One row, looped: copies laid end to end slide by exactly one copy's width, then start over where
 * the next copy stood, so the seam never shows.
 */
const Row = ({ chips, isReversed, setBack }: { chips: readonly PromiseChip[]; isReversed: boolean; setBack: number }) => {
  const [copyWidth, setCopyWidth] = useState(0);
  const shift = useSharedValue(0);
  const isReducedMotion = useReducedMotion();

  useEffect(() => {
    if (copyWidth === 0 || isReducedMotion) return;

    shift.value = isReversed ? -copyWidth : 0;
    shift.value = withRepeat(
      withTiming(isReversed ? 0 : -copyWidth, {
        duration: (copyWidth / DRIFT_PER_SECOND) * 1000,
        easing: Easing.linear,
      }),
      -1,
    );

    return () => cancelAnimation(shift);
  }, [copyWidth, isReversed, isReducedMotion, shift]);

  const drift = useAnimatedStyle(() => ({ transform: [{ translateX: shift.value - setBack }] }));

  return (
    <Animated.View style={[styles.track, drift]}>
      {Array.from({ length: COPIES }, (_, copy) => (
        <View
          key={copy}
          style={styles.copy}
          onLayout={copy === 0 ? (event) => setCopyWidth(event.nativeEvent.layout.width) : undefined}
        >
          {chips.map((chip) => (
            <View key={chip.id} style={[styles.chip, { backgroundColor: TONE_BACKGROUND[chip.tone] }]}>
              <Text.H4 color={TONE_FOREGROUND[chip.tone]}>{chip.emoji}</Text.H4>
              <Text.Lg weight={600} numberOfLines={1} color={TONE_FOREGROUND[chip.tone]}>
                {chip.label}
              </Text.Lg>
            </View>
          ))}
        </View>
      ))}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wall: { gap: GAP, overflow: "hidden", paddingVertical: theme.spacing[8] },
  track: { flexDirection: "row" },
  /** Its trailing gap is part of it, so the next copy starts exactly one gap after the last chip. */
  copy: { flexDirection: "row", gap: GAP, paddingRight: GAP },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[24],
    paddingHorizontal: theme.spacing[24],
    borderRadius: theme.radius.md,
    borderWidth: 2,
    borderColor: colors.border.default,
  },
});
