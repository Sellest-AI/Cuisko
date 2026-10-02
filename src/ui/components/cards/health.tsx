import { StyleSheet, type ViewProps } from "react-native";

import { theme } from "theme";
import { HeartIcon } from "../icons";
import { ScoreRing } from "../score-ring";
import { Text } from "../text";
import { BentoCard } from "./bento";

const RING_SIZE = 48;
const RING_WIDTH = 4;

type Props = {
  label: string;
  /** Already formatted: the caller decides what a missing figure reads as. */
  value: string;
  /** 0-100: how much of the ring is filled. Missing, the ring is left empty. */
  score?: number;
  style?: ViewProps["style"];
};

/** A score, centred under a heart whose ring fills with it. */
export const HealthCard = ({ label, value, score, style }: Props) => (
  <BentoCard style={[styles.container, style]}>
    <ScoreRing
      score={score ?? 0}
      size={RING_SIZE}
      strokeWidth={RING_WIDTH}
      trackColor={theme.colors.neutral.subtle}
      fillColor={theme.colors.success.subtle}
      style={styles.ring}
    >
      <HeartIcon size={16}
        color={theme.colors.success.elevated}
        fill={theme.colors.success.elevated}
      />
    </ScoreRing>
    <Text.H4 style={styles.value}>{value}</Text.H4>
    <Text.Base style={styles.label}>{label}</Text.Base>
  </BentoCard>
);

const styles = StyleSheet.create({
  container: {
    minHeight: 140,
    padding: theme.spacing[12],
    alignItems: "center"
  },
  /** Pushes the figure and its label to the card's bottom. */
  ring: { marginBottom: "auto" },
  value: {
    color: theme.colors.neutral.base,
    fontFamily: theme.font.h4.fontFamily,
  },
  label: { color: theme.colors.neutral.muted },
});
