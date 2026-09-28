import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { DayGrid, type DayGridDay } from "@ui/day-grid";
import { CircleCheck, Lightbulb } from "@ui/icons";
import { InfoBanner } from "@ui/info-banner";
import { m } from "@ui/motion";
import { SectionLabel } from "@ui/section-label";
import { StepHeader } from "@ui/step-header";
import { theme } from "theme";
import { useTranslations } from "translations";

import { useLocale } from "~/hooks/useLocale";
import { CUISKO } from "~/lib/mascots";
import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { IMPORTED_RECIPE, PLAN_DAYS, PLANNED, RECIPES, type IngredientId } from "./_model/fixtures";
import type { PantryRow } from "./_model/pantry";
import { Hint } from "./_components/hint";
import { useOnboarding } from "./_hooks/useOnboarding";
import { useProgressClearance } from "./_hooks/useProgressClearance";
import { useOnboardingPantry } from "./_hooks/useOnboardingPantry";
import { PLATES } from "./photos";

/**
 * The day grid's tile, copied so a box can be laid over one: three across, each a third of the row
 * and 160 tall (its 128 plate and the label under it), 8 apart.
 *
 * @limitation Copied from `@ui/day-grid` rather than read from it. **Accepted because** the grid
 * is shared with the real planning sheet, and giving it a hook just for the onboarding's paw was
 * more than one pointer needs. **Until fixed**, a change to the grid's tile size has to be copied
 * here, or the paw points beside the tile. **The fix** is a `wrapTile` prop on `DayGrid`.
 */
const GRID_COLUMNS = 3;
const TILE_HEIGHT = 160;
const TILE_GAP = theme.spacing[8];

/** The app's own stand-in for a day with nothing on it, as the real sheet draws. */
const EMPTY_PLATE = require("assets/placeholders/empty-plate.png");

/** The days from tomorrow, at midnight, so a label never reads as today. */
const upcomingDays = (count: number) => {
  const today = new Date();

  return Array.from(
    { length: count },
    (_, index) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1 + index),
  );
};

/**
 * Screen 5: planning the imported gratin, on the real sheet's day grid.
 *
 * Two days already hold a dish, so the grid reads as a week in use rather than a blank form. A tap
 * on a free day puts the gratin there, and the banner says what went on the list: everything the
 * gratin needs, since the cellar from screen 2 holds only carrots and onions.
 */
export const OnboardingPlanRecipe = () => {
  const t = useTranslations("Onboarding");
  const tPlanning = useTranslations("Planning");
  const locale = useLocale();
  const { complete } = useOnboarding();
  const clearance = useProgressClearance();
  const { plan } = useOnboardingPantry();
  const [planned, setPlanned] = useState<{ day: number; added: PantryRow[] } | null>(null);

  useEffect(() => {
    if (planned) complete();
  }, [planned, complete]);

  const dates = useMemo(() => upcomingDays(PLAN_DAYS), []);

  const days: (DayGridDay & { index: number })[] = dates.map((date, index) => {
    const recipe = planned?.day === index ? IMPORTED_RECIPE : PLANNED.find((taken) => taken.day === index)?.recipe;

    return {
      index,
      date,
      meal: recipe && { title: t(`RecipeNames.${recipe}`), imageSrc: PLATES[recipe] },
    };
  });

  /** A free day only, and only once: replacing a dish is the real sheet's question, not this one's. */
  const choose = (day: DayGridDay & { index: number }) => {
    if (day.meal || planned) return;

    setPlanned({ day: day.index, added: plan(RECIPES[IMPORTED_RECIPE].lines) });
  };

  /**
   * The paw's day: the first one free, the tap the banner above it asks for.
   *
   * Read off the fixtures, not off `days`: once the gratin lands on this day, `days` would name the
   * next free one, and the box would jump there in the very frame the paw is told to go, faster
   * than the paw can hear it. Pinned to the day it asked for, the box stays put while the paw leaves.
   */
  const firstFree = dates.findIndex((_, index) => !PLANNED.some((taken) => taken.day === index));

  /** Every added line is a fixture one, so its ingredient is an `IngredientId`. */
  const added = planned?.added.map((row) => t(`Ingredients.${row.ingredient as IngredientId}`)).join(", ");

  return (
    <ScrollView contentContainerStyle={[styles.page, { paddingTop: clearance }]} showsVerticalScrollIndicator={false}>
      <StepHeader title={t("PlanRecipe.title")} mascot={CUISKO.calendar} />
      <View style={styles.body}>
        {planned ? (
          <m.View from={{ opacity: 0, translateY: 8 }} animate={{ opacity: 1, translateY: 0 }} style={styles.banner}>
            <InfoBanner variant="secondary" title={t("PlanRecipe.added_title")} icon={CircleCheck}>
              {t("PlanRecipe.added", { items: added ?? "" })}
            </InfoBanner>
          </m.View>
        ) : (
          <InfoBanner variant="tip" title={t("PlanRecipe.tip_title")} icon={Lightbulb} style={styles.banner}>
            {t("PlanRecipe.tip")}
          </InfoBanner>
        )}
        <SectionLabel label={tPlanning("PlanRecipe.day")} />
        <View>
          <DayGrid
            days={days}
            emptyPlate={EMPTY_PLATE}
            emptyLabel={tPlanning("Status.empty")}
            dayLabel={(date) => date.toLocaleDateString(locale, { weekday: "short", day: "numeric" })}
            onChoose={choose}
          />
          {/*
            An empty box over the first free tile, for the paw to point at: touched by nothing, so
            the tap lands on the real tile underneath.
          */}
          {firstFree >= 0 && (
            <Hint
              active={!planned}
              style={{
                ...styles.pointer,
                left: `${((firstFree % GRID_COLUMNS) * 100) / GRID_COLUMNS}%`,
                top: TILE_GAP / 2 + Math.floor(firstFree / GRID_COLUMNS) * (TILE_HEIGHT + TILE_GAP),
              }}
            >
              <View pointerEvents="none" style={styles.fill} />
            </Hint>
          )}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  /** Clears the pill, which floats over the page rather than sitting in it. */
  page: { paddingBottom: NAVIGATION_BAR_OFFSET },
  body: { paddingHorizontal: theme.spacing[16] },
  banner: { marginBottom: theme.spacing[4] },
  pointer: {
    position: "absolute",
    width: `${100 / GRID_COLUMNS}%`,
    height: TILE_HEIGHT,
    marginLeft: -TILE_GAP / 2,
    pointerEvents: "none",
  },
  fill: { flex: 1 },
});
