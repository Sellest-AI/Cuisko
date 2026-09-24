import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { PlateCarouselEmpty } from "@ui/carousels/plate.empty";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";
import { EMPTY_PLATE_IMAGE } from "./_hooks/placeholders";

/**
 * The week before anyone has planned one: a heading and the empty plate carousel, with one thing
 * to do.
 *
 * It draws the carousel rather than a message alone, because the plates are what a planned week
 * looks like: the first plan then arrives into a layout the user has already seen (PRODUCT.md —
 * the planning screens carry the promise).
 *
 * No week strip. With nothing planned, every one of its days led to the same tunnel as the
 * carousel, so it offered no way in the carousel does not.
 *
 * No meal toggle. Lunch and dinner are a choice between two plates, and there are none; a pill
 * flipping a word above three empty rings is furniture pretending to be a control.
 */
export const WeeklyPlanEmpty = () => {
  const t = useTranslations("Planning");

  const plan = () => router.push("/planning/new/setup");

  return (
    <View>
      <View style={styles.heading}>
        <Text.H4>{t("WeeklyPlan.empty_title")}</Text.H4>
        <Text.Base color={theme.colors.muted} style={styles.subtitle}>
          {t("WeeklyPlan.empty_subtitle")}
        </Text.Base>
      </View>
      <PlateCarouselEmpty
        style={styles.carousel}
        label={t("WeeklyPlan.empty_action")}
        emptyPlateImageSrc={EMPTY_PLATE_IMAGE}
        onPress={plan}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  heading: {
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing[2],
    marginTop: theme.spacing[24],
  },
  subtitle: { textAlign: "center", paddingHorizontal: theme.spacing[24] },
  carousel: {
    marginTop: theme.spacing[16],
    minHeight: 188,
  },
});
