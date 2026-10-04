import { ComponentProps, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { CalendarIcon, CircleCheck, Lightbulb } from "@ui/icons";
import { InfoBanner } from "@ui/info-banner";
import { LoadingScreen } from "@ui/loading-screen";
import { m } from "@ui/motion";
import { StepHeader } from "@ui/step-header";
import { theme } from "theme";
import { useTranslations } from "translations";

import cuiskoCooking from "assets/videos/cuisko-cooking";

import { PlanningListRow } from "~/modules/planning/planning-row";

import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { Hint } from "./_components/hint";
import { IMPORTED_RECIPE, RECIPES, WEEK, WEEK_SWAP } from "./_model/fixtures";
import { useOnboarding } from "./_hooks/useOnboarding";
import { useProgressClearance } from "./_hooks/useProgressClearance";
import { PLATES } from "./photos";

/** One pass through the jokes, then the bar runs full: long enough to read two of them. */
const GENERATING_MS = 3000;
/** The full bar holds this long before the week replaces it, so the finish is seen. */
const FINISH_HOLD_MS = 900;

/** The generating step's own jokes, borrowed so the wait reads as the one the tunnel will show. */
const GENERATING_STEPS = [
  "Tunnel.Generating.step_cellar",
  "Tunnel.Generating.step_leftovers",
  "Tunnel.Generating.step_vegetables",
] as const;

type Phase = "generating" | "finishing" | "week";

type Row = ComponentProps<typeof PlanningListRow>["row"];

/** The gap between two days, as the tunnel's review step leaves it. */
const DAY_GAP = theme.spacing[32];

/**
 * Screen 7: the week, planned the moment the intro's "Plan my week" is pressed.
 *
 * No questions here: the intro's screenshot shows the options the tunnel asks, and this screen goes
 * straight to the tunnel's own loader, then a week drawn from the fixtures, with one swap offered to
 * show a plan is a suggestion. Nothing is saved. The chrome's "Meet Cuisko" waits until the week
 * is drawn.
 */
export const OnboardingWeek = () => {
  const t = useTranslations("Onboarding");
  const tPlanning = useTranslations("Planning");
  const { complete } = useOnboarding();
  const clearance = useProgressClearance();
  const [phase, setPhase] = useState<Phase>("generating");
  const [isSwapped, setSwapped] = useState(false);

  useEffect(() => {
    if (phase !== "generating" && phase !== "finishing") return;

    const timer = setTimeout(
      () => setPhase(phase === "generating" ? "finishing" : "week"),
      phase === "generating" ? GENERATING_MS : FINISH_HOLD_MS,
    );

    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase === "week") complete();
  }, [phase, complete]);

  const dates = useMemo(() => {
    const today = new Date();

    return WEEK.map((_, index) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1 + index));
  }, []);

  if (phase === "generating" || phase === "finishing") {
    return (
      <LoadingScreen
        animation={cuiskoCooking}
        steps={GENERATING_STEPS.map((key) => tPlanning(key))}
        durationMs={GENERATING_MS}
        footer={tPlanning("Tunnel.Generating.footer")}
        showBackground={false}
        /** The onboarding's own progress is already above it. */
        showProgress={false}
        fadeInOut
        finished={phase === "finishing"}
      />
    );
  }

  const week = WEEK.map((recipe, day) => (isSwapped && day === WEEK_SWAP.day ? WEEK_SWAP.recipe : recipe));

  /**
   * The week as the review step's own rows: a `DayMarker` in the rail and a plate beside it, one
   * dinner a day. The gratin is short of cream and gruyère, so it says so, as a real week would.
   */
  const rows: Row[] = week.map((recipe, day) => ({
    kind: "meal",
    id: String(day),
    date: dates[day]!,
    dayStatus: "empty",
    isDayStart: true,
    meal: {
      id: `${day}:${recipe}`,
      recipeId: recipe,
      date: dates[day]!,
      slot: "dinner",
      title: t(`RecipeNames.${recipe}`),
      minutes: RECIPES[recipe].minutes,
      servings: 2,
      status: recipe === IMPORTED_RECIPE ? "shopping-needed" : "ready",
      imageSrc: PLATES[recipe],
    },
  }));

  return (
    <ScrollView contentContainerStyle={[styles.page, { paddingTop: clearance }]} showsVerticalScrollIndicator={false}>
      <StepHeader title={t("Week.ready")} icon={CalendarIcon} />
      <View style={styles.body}>
        {/* Keyed, so the tip is replaced by its answer rather than rewritten in place. */}
        <m.View key={isSwapped ? "swapped" : "swap"} from={{ opacity: 0 }} animate={{ opacity: 1 }} style={styles.banner}>
          {isSwapped ? (
            <InfoBanner variant="secondary" title={t("Week.swapped_title")} icon={CircleCheck}>
              {t("Week.swapped")}
            </InfoBanner>
          ) : (
            <InfoBanner variant="tip" title={t("Week.swap_title")} icon={Lightbulb}>
              {t("Week.tip_swap", { recipe: t(`RecipeNames.${WEEK[WEEK_SWAP.day]!}`) })}
            </InfoBanner>
          )}
        </m.View>
        {rows.map((row, day) => {
          const isSwappable = day === WEEK_SWAP.day && !isSwapped;

          return (
            <Hint key={row.id} active={isSwappable} style={styles.row}>
              <m.View key={row.kind === "meal" ? row.meal.recipeId : row.id} from={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <PlanningListRow
                  row={row}
                  variant="review"
                  onTrailingPress={isSwappable ? () => setSwapped(true) : undefined}
                />
              </m.View>
            </Hint>
          );
        })}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  /** Clears the pill, which floats over the page rather than sitting in it. */
  page: { paddingBottom: NAVIGATION_BAR_OFFSET },
  body: { paddingHorizontal: theme.spacing[16] },
  banner: { marginBottom: theme.spacing[32] },
  row: { marginBottom: DAY_GAP },
});
