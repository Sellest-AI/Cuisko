import { StyleSheet, View, ViewProps } from "react-native";

import { FastingCard } from "@ui/cards/fasting";
import { HealthCard } from "@ui/cards/health";
import { ProgressCard } from "@ui/cards/progress";
import { theme } from "theme";
import { useTranslations } from "translations";

type Props = {
  progress?: number;
  recentScores: number[];
  fastingHours?: number;
  health?: number;
  style?: ViewProps["style"]
};

/** A figure the period could not produce. Shown rather than hidden, so the three cards keep their row. */
const _MISSING = "–";

const _whole = (value?: number) => (value === undefined ? _MISSING : `${Math.round(value)}`);

/** Progress, Fasting and Health, side by side. */
export const SummaryTiles = ({ progress, recentScores, fastingHours, health, style }: Props) => {
  const t = useTranslations("Health");

  return (
    <View style={[styles.row, style]}>
      <ProgressCard
        label={t("WeekSummary.progress")}
        value={_whole(progress)}
        scores={recentScores}
        locked={progress === undefined}
        style={[progress === undefined && styles.locked, styles.progress, styles.card]}
      />
      <FastingCard
        label={t("WeekSummary.fasting")}
        value={fastingHours === undefined ? _MISSING : t("WeekSummary.hours", { count: Math.round(fastingHours) })}
        locked={fastingHours === undefined}
        style={[fastingHours === undefined && styles.locked, styles.fasting, styles.card]}
      />
      <HealthCard
        label={t("WeekSummary.health")}
        value={_whole(health)}
        score={health}
        style={[styles.card, styles.health]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  locked: {
    borderWidth: 2,
    backgroundColor: theme.colors.surface.elevated,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radius.sm,
    opacity: 0.5,
  },
  row: { flexDirection: "row", gap: theme.spacing[8], paddingHorizontal: theme.spacing[16] },
  card: { flex: 1 },
  fasting: { minWidth: 88 },
  progress: { minWidth: 88, maxWidth: 104 },
  health: { minWidth: 80 },
});
