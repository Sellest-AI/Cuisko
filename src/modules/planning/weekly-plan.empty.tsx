import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { PlateCarouselEmpty } from "@ui/carousels/plate.empty";
import { Plus } from "@ui/icons";
import { Text } from "@ui/text";
import { WeekStrip, type WeekDay } from "@ui/week-strip";
import { theme } from "theme";
import { resolveLocale, useTranslations } from "translations";
import { EMPTY_PLATE_IMAGE } from "./_hooks/placeholders";

type Props = {
  /** The same seven days the planned week draws, so the page does not resize when the first plan lands. */
  days: WeekDay[];
};

/**
 * The week before anyone has planned one.
 *
 * It draws the week rather than replacing it with a message, because the shape is the explanation:
 * seven days, three slots, one thing to do. A centred illustration with a button under it would
 * have to describe in words what the page already shows, and the first plan would then arrive into
 * a layout the user has never seen (PRODUCT.md — the planning screens carry the promise).
 *
 * **Every day is drawn `empty`, whatever the calendar says.** `dayStatusFor` marks a day by where
 * it sits against today, so the days behind us come back `complete` — which is true of a week that
 * was cooked and a lie about a week that never existed. Nothing here is complete.
 *
 * No meal toggle. Lunch and dinner are a choice between two plates, and there are none; a pill
 * flipping a word above three empty rings is furniture pretending to be a control.
 *
 * Every way in leads to the same place. A day, the badge — the answer to all of them is the
 * planning tunnel, so they all say so rather than each offering a different smaller start.
 */
export const WeeklyPlanEmpty = ({ days }: Props) => {
  const t = useTranslations("Planning");
  const locale = resolveLocale();

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
      <WeekStrip
        style={styles.week}
        days={days.map((day) => ({ ...day, status: "empty" as const }))}
        onAdd={plan}
        locale={locale}
        icon={Plus}
        onSelect={plan}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  heading: {
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing[4],
    marginTop: theme.spacing[24],
  },
  subtitle: { textAlign: "center", paddingHorizontal: theme.spacing[24] },
  carousel: {
    marginTop: theme.spacing[16],
    minHeight: 188,
  },
  week: {
    marginTop: theme.spacing[24],
  },
});
