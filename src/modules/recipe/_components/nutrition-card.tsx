import { View, StyleSheet, ViewStyle } from "react-native";

import { SparklesIcon } from "@ui/icons";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

import { Stat } from "./stat";

type Props = {
  protein: string;
  fat: string;
  carbs: string;
  calories: string;
  style?: ViewStyle;
};

/**
 * The macro breakdown, carrying its own "AI Generated" mark.
 *
 * The mark is part of the card rather than a caller's decision: these numbers are inferred from the
 * ingredients, never measured, and a screen that dropped the label would be claiming otherwise.
 */
export const NutritionCard = ({ protein, fat, carbs, calories, style }: Props) => {
  const t = useTranslations("Recipe");

  return (
    <View style={[styles.card, style]}>
      <View style={styles.heading}>
        <Text.Lg>{t("Nutrition.title")}</Text.Lg>
        <View style={styles.credit}>
          <SparklesIcon size={12} color={theme.colors.primary.base} />
          <Text.Sm color={theme.colors.primary.base}>{t("Nutrition.estimated")}</Text.Sm>
        </View>
      </View>
      <View style={styles.stats}>
        <Stat label={t("Nutrition.protein")} value={`🍗 ${protein}`} />
        <Stat label={t("Nutrition.fat")} value={`🥑 ${fat}`} />
        <Stat label={t("Nutrition.carbs")} value={`🧅 ${carbs}`} />
        <Stat label={t("Nutrition.calories")} value={`🔥 ${calories}`} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface.elevatedSubtle,
    borderColor: theme.colors.border.default,
    borderWidth: 2,
    borderRadius: theme.radius.md,
    padding: theme.spacing[16],
    gap: theme.spacing[12],
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  credit: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[4],
  },
  stats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
