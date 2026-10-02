import { StyleSheet, View, type ViewProps } from "react-native";

import { theme } from "theme";
import { MoonIcon } from "../icons";
import { LockCover } from "../lock-cover";
import { Text } from "../text";
import { BentoCard } from "./bento";

const HALO_SIZE = 96;

type Props = {
  label: string;
  /** Already formatted, unit included ("12h"). */
  value: string;
  /** No figure yet: the card is frosted over with a lock rather than showing an empty value. */
  locked?: boolean;
  style?: ViewProps["style"];
};

/** A duration overnight: a moon in the corner, the figure and its label in the opposite one. */
export const FastingCard = ({ label, value, locked, style }: Props) => (
  <LockCover locked={locked} radius={theme.radius.sm} style={style}>
    <BentoCard style={styles.container}>
      <View style={styles.halo} />
      <View style={styles.moon}>
        <MoonIcon
          color={theme.colors.neutral.muted}
          fill={theme.colors.neutral.muted}
          size={24}
        />
      </View>
      <Text.H4 style={styles.value}>{value}</Text.H4>
      <Text.Base style={styles.label}>{label}</Text.Base>
    </BentoCard>
  </LockCover>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 140,
    padding: theme.spacing[12],
    alignItems: "flex-end",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  /** The soft disc the moon sits in, cut by the card's corner. */
  halo: {
    position: "absolute",
    top: -HALO_SIZE / 4,
    left: -HALO_SIZE / 4,
    width: HALO_SIZE,
    height: HALO_SIZE,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.neutral.elevated,
    opacity: 0.4,
  },
  moon: {
    position: "absolute",
    top: theme.spacing[20],
    left: theme.spacing[20]
  },
  value: {
    color: theme.colors.neutral.base,
    fontFamily: theme.font.h4.fontFamily,
  },
  label: { color: theme.colors.neutral.muted },
});
