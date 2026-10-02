import { router } from "expo-router";
import { Platform, ScrollView, StyleSheet, View } from "react-native";

import { ScoredDish } from "@ui/cards/scored-dish";
import { NutrientGauge } from "@ui/nutrient-gauge";
import { Text, TextNative } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

import { COVER_PLACEHOLDER } from "~/modules/recipes/constants";
import { recipeRoute } from "~/modules/recipes/routes";

import { useWeekSummary } from "./_hooks/useWeekSummary";
import { SummaryTiles } from "./week-summary.tiles";

/**
 * How the household ate over its last cooking days: calories per portion, five nutrients against
 * what lunch and dinner should bring, then Progress, Fasting and Health, and the dishes behind them.
 *
 * In `health/`, the domain for what the household eats rather than what it plans or buys: the
 * plates are planning's, but reading them back as nutrition is not. At the module root because Home
 * opens it, through `WeekSummaryReveal`, on the terms `WeeklyPlan` is rendered: it calls its own hook,
 * so the consumer places the tag and inherits no data obligation. Every figure arrives
 * computed (ADR 0015) — this file formats, it never derives.
 *
 * The colour scale from danger to success lives here and nowhere else: a summary of the week may
 * say how it went, plate by plate included, while outside it a single plate is never judged
 * (PRODUCT.md §1).
 *
 * The card's surface (border, fill, corners) is the reveal's box, not drawn here: the box is what
 * grows out of the score pill, and this is the content it uncovers.
 *
 * @limitation Design choice, for now: a household with nothing cooked yet sees the card with empty
 * figures. That waits for its own slice.
 */
export const WeekSummary = () => {
  const t = useTranslations("Health");
  const { summary } = useWeekSummary();

  if (!summary) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text.H4 style={styles.title}>{t("WeekSummary.title")}</Text.H4>
      </View>
      <View style={styles.calories}>
        <TextNative style={styles.caloriesFigure}>
          {summary.caloriesPerPortion === undefined ? "–" : Math.round(summary.caloriesPerPortion)}
        </TextNative>
        <TextNative style={styles.flame}>🔥</TextNative>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
        {summary.nutrients.map((nutrient) => (
          <NutrientGauge
            key={nutrient.key}
            label={t(`WeekSummary.Nutrients.${nutrient.key}`)}
            percent={nutrient.percent}
          />
        ))}
      </ScrollView>
      <SummaryTiles
        progress={summary.progress}
        recentScores={summary.recentScores}
        fastingHours={summary.fastingHours}
        health={summary.health}
        style={styles.summary}
      />
      {summary.dishes.length > 0 && <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.shelf, styles.dished]}
      >
        {summary.dishes.map((dish) => (
          <ScoredDish
            key={dish.plateId}
            imageSrc={dish.imageUrl ? { uri: dish.imageUrl } : COVER_PLACEHOLDER}
            score={dish.cuiScore}
            onPress={() => router.push(recipeRoute(dish.recipeId))}
          />
        ))}
      </ScrollView>}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    paddingTop: theme.spacing[24]
  },
  header: {
    justifyContent: "center",
    paddingHorizontal: theme.spacing[24],
    marginBottom: theme.spacing[8],
  },
  title: { color: theme.colors.neutral.muted },
  calories: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[4],
    paddingHorizontal: theme.spacing[24],
    marginTop: theme.spacing[4]
  },
  caloriesFigure: {
    fontSize: 56,
    lineHeight: 64,
    color: theme.colors.neutral.base,
    fontFamily: theme.font.h4.fontFamily,
  },
  flame: {
    fontSize: 32,
    lineHeight: 40,
    marginBottom: Platform.select({ ios: theme.spacing[4], default: -theme.spacing[4] }),
  },
  summary: {
    marginBottom: theme.spacing[16]
  },
  shelf: {
    gap: theme.spacing[28],
    paddingHorizontal: theme.spacing[24],
    marginBottom: theme.spacing[32],
    marginTop: theme.spacing[12],
  },
  dished: {
    paddingHorizontal: theme.spacing[20],
    marginTop: theme.spacing[16],
    marginBottom: theme.spacing[28],
    gap: theme.spacing[20],
  }
});
