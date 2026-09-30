import { useState } from "react";
import { View, StyleSheet, ViewStyle, type LayoutChangeEvent } from "react-native";

import { BentoCard } from "@ui/cards/bento";
import { Text, TextNative } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

import { TimingsDial } from "./timings.dial";

export type Timing = {
  label: string;
  value: string;
  isTotal?: boolean;
};

type Props = {
  timings: Timing[];
  /**
   * The recipe's own total in minutes, as the backend ships it — never summed from `timings`.
   * Absent only when the recipe declares no timing, which the screen already hides the card for.
   */
  total?: number;
  style?: ViewStyle;
};

/**
 * The recipe's total time on a dial, with the timings it is made of listed beside it.
 *
 * The total row is dropped from the list once there are other rows to list, since the dial already
 * shows it; with a single timing it stays, so the list is never empty.
 */
export const Timings = ({ timings, total, style }: Props) => {
  const t = useTranslations("Recipe");
  /** Unknown until the first layout; the dial waits for it rather than guessing and then jumping. */
  const [cardHeight, setCardHeight] = useState<number>();
  const onLayout = (event: LayoutChangeEvent) => setCardHeight(event.nativeEvent.layout.height);

  const finalTimings = timings.length > 2 ? timings.filter((timing) => !timing.isTotal) : timings;

  const rows = finalTimings.map((timing) => (
    <View style={styles.caption} key={timing.label}>
      <Text.Sm numberOfLines={1} color={theme.colors.neutral.muted}>{timing.label}</Text.Sm>
      <Text.Base numberOfLines={1} color={theme.colors.neutral.base}>{timing.value}</Text.Base>
    </View>
  ));

  /**
   * The disc hangs from a zero-size anchor centred in the card, so its centre sits `DISC_CENTER`
   * below the card's middle. The knob's band is the card's height less 20% at each end, restated
   * from the disc's centre, which is where the dial measures from.
   */
  const discCenterY = cardHeight !== undefined ? cardHeight / 2 + DISC_CENTER : 0;
  const knobBand = cardHeight !== undefined && {
    top: cardHeight * KNOB_INSET - discCenterY,
    bottom: cardHeight * (1 - KNOB_INSET) - discCenterY,
  };

  return <BentoCard style={[styles.container, style]} onLayout={onLayout}>
    <View>
      <View style={clockStyles.clockContainer}>
        <View style={clockStyles.clockBackground} />
        {total !== undefined && knobBand && (
          <TimingsDial minutes={total} discRadius={DISC_RADIUS} knobBand={knobBand} />
        )}
        <View style={clockStyles.clockTimer}>
          <Text.Base style={clockStyles.label}>{t("Overview.dial_unit")}</Text.Base>
          <TextNative style={clockStyles.score}>
            {total?.toFixed(1)}
          </TextNative>
        </View>
      </View>
    </View>
    <View style={styles.timings}>
      {rows}
    </View>
  </BentoCard>;
}

const DISC_RADIUS = 100;
const DISC_TOP = -80;
/** Where the disc's centre sits relative to the card's vertical middle; negative is above. */
const DISC_CENTER = DISC_TOP + DISC_RADIUS;
/** The share of the card's height the knob keeps clear of, at the top and at the bottom. */
const KNOB_INSET = 0.2;

const clockStyles = StyleSheet.create({
  /** Centred a little above the card's middle, and pushed left so only its right side shows. */
  clockContainer: {
    width: DISC_RADIUS * 2,
    height: DISC_RADIUS * 2,
    position: "absolute",
    top: DISC_TOP,
    left: -70,
    borderRadius: DISC_RADIUS * 2,
  },
  clockBackground: {
    position: "absolute",
    width: "100%",
    height: "100%",
    backgroundColor: theme.colors.primary.subtle,
    borderRadius: DISC_RADIUS * 2,
    opacity: 0.5,
  },
  clockTimer: {
    position: "absolute",
    top: 55,
    left: 72
  },
  label: {
    color: theme.colors.primary.elevated,
    marginBottom: theme.spacing[2]
  },
  score: {
    fontSize: 32,
    lineHeight: 40,
    color: theme.colors.primary.base,
    fontFamily: theme.font.h4.fontFamily,
  },
})

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing[16],
    paddingVertical: theme.spacing[20],
    paddingHorizontal: theme.spacing[24],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    overflow: "hidden",
    minHeight: 128,
  },
  timings: {
    gap: theme.spacing[16],
  },
  caption: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.spacing[8],
  },
});
