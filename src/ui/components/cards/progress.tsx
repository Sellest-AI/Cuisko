import { StyleSheet, type ViewProps } from "react-native";

import { theme } from "theme";
import { LockCover } from "../lock-cover";
import { ScoreBars } from "../score-bars";
import { Text } from "../text";
import { BentoCard } from "./bento";

type Props = {
  label: string;
  /** Already formatted: the caller decides what a missing figure reads as. */
  value: string;
  /** 0-100 each, oldest first: one bar per recent score. */
  scores: number[];
  /** No figure yet: the card is frosted over with a lock rather than showing an empty value. */
  locked?: boolean;
  style?: ViewProps["style"];
};

/** A trend: the figure on top, the recent scores that make it as bars underneath. */
export const ProgressCard = ({ label, value, scores, locked, style }: Props) => (
  <LockCover
    locked={locked}
    radius={theme.radius.sm}
    style={style}
  >
    <BentoCard style={styles.container}>
      <Text.Base style={styles.label}>{label}</Text.Base>
      <Text.H4 style={styles.value}>{value}</Text.H4>
      <ScoreBars scores={scores} style={styles.bars} />
    </BentoCard>
  </LockCover>
);

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 140, padding: theme.spacing[12] },
  label: { color: theme.colors.neutral.muted },
  value: { color: theme.colors.neutral.base, fontFamily: theme.font.h4.fontFamily },
  bars: { marginTop: "auto" },
});
