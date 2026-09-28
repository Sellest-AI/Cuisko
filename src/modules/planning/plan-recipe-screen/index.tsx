import { type ReactNode, useCallback, useState } from "react";
import { Platform, StyleSheet, View, type ViewStyle } from "react-native";

import { GroupSelect } from "@ui/group-select";
import { DatabaseX, ShoppingCart } from "@ui/icons";
import { InfoBanner } from "@ui/info-banner";
import { ModalScrollView } from "@ui/modal-scroll-view";
import { StepSlider } from "@ui/step-slider";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

import { useLocale } from "~/hooks/useLocale";
import { MODAL_MAX_DETENT } from "~/modules/navigation/constants";
import { useDeclaredModalSheet, useMeasuredModalSheet } from "~/modules/navigation/modal-sheet";
import { useRecipe } from "~/modules/recipes/hooks";

import { SectionLabel } from "@ui/section-label";
import { usePlanRecipe, type PlannableDay } from "../_hooks/usePlanRecipe";
import { MAX_SERVINGS, MEAL_SLOTS, type MealSlot } from "../_model/model";
import { Confirm } from "./confirm";
import { DayGrid } from "@ui/day-grid";

/** A plate with nothing on it yet: a tile's picture until a dish lands there, and a dish with no photo. */
const EMPTY_PLATE = require("assets/placeholders/empty-plate.png");

/** Clears the close button drawn by the modal layout. */
const CHROME_HEIGHT = 32;

/**
 * Named keys rather than `t(`Meal.${slot}`)`, for the reason the setup step gives: the template form
 * types as `string`, so a slot added without its copy would ship the key itself as the label.
 */
const SLOTS = {
  lunch: { key: "Meal.lunch", emoji: "☀️" },
  dinner: { key: "Meal.dinner", emoji: "🌙" },
} as const satisfies Record<MealSlot, { key: string; emoji: string }>;

type Props = {
  params: { recipeId?: string };
  onClose: () => void;
};

/**
 * A short, fixed view sizes the sheet to itself. The one place the measuring handler is spread, so
 * the empty states and the confirmation cannot disagree about how a fixed view is sized.
 */
const Measured = ({ children, style }: { children?: ReactNode; style?: ViewStyle }) => {
  const onLayout = useMeasuredModalSheet();

  return <View onLayout={onLayout} style={[styles.page, style]}>{children}</View>;
};

const Nothing = ({ label }: { label: string }) => (
  <Measured style={styles.empty}>
    <Text.Base color={theme.colors.muted}>{label}</Text.Base>
  </Measured>
);

/**
 * The grid takes the tallest sheet and scrolls inside it: nine tiles under a slider and two chips
 * are taller than a phone, and a `ScrollView` under a measured column has no bottom bound to
 * resolve against — it collapses to nothing, and the sheet cuts itself to that.
 */
const Scrolling = ({ children }: { children: ReactNode }) => {
  useDeclaredModalSheet(MODAL_MAX_DETENT);

  return <ModalScrollView contentContainerStyle={styles.page}>{children}</ModalScrollView>;
};

const Picker = ({ recipeId, onClose }: { recipeId: string; onClose: () => void }) => {
  const t = useTranslations("Planning");
  const locale = useLocale();
  const { recipe, servings: recipeServings, isMissing } = useRecipe(recipeId);
  const { days, slot, setSlot, servings, setServings, plan, isSaving, failed } =
    usePlanRecipe({ recipeId, initialServings: recipe ? recipeServings : undefined });

  /** The tile tapped while a dish was already on it: the sheet asks before it replaces. */
  const [pending, setPending] = useState<PlannableDay>();

  /** Closes on a plate that landed; a refused one keeps the sheet open, with the banner saying why. */
  const commit = useCallback(async (date: Date) => {
    if (await plan(date)) onClose();
    else setPending(undefined);
  }, [plan, onClose]);

  const choose = useCallback((day: PlannableDay) => {
    if (day.meal) setPending(day);
    else void commit(day.date);
  }, [commit]);

  if (isMissing) return <Nothing label={t("PlanRecipe.missing")} />;
  /** The recipe is being asked for; an empty sheet beats a slider that jumps when the seed lands. */
  if (!recipe || servings === undefined) return <Measured style={styles.empty} />;

  const dayLabel = (date: Date) => date.toLocaleDateString(locale, { weekday: "short", day: "numeric" });

  const banner = failed && (
    <InfoBanner variant="warning" title={t("PlanRecipe.failed_title")} icon={DatabaseX}>
      {t("PlanRecipe.failed_body")}
    </InfoBanner>
  );

  /**
   * Two views, two ways of sizing the sheet. The confirmation is short and fixed, so it measures
   * itself and the sheet shrinks to it; the grid is taller than a phone, so it declares the tallest
   * sheet and scrolls. Mounting one after the other is what moves the sheet between the two.
   */
  if (pending?.meal) {
    return (
      <Measured style={styles.confirm}>
        {banner}
        <Confirm
          previous={{ imageSrc: pending.meal.imageSrc ?? EMPTY_PLATE }}
          next={{ imageSrc: recipe.plateImageUrl ? { uri: recipe.plateImageUrl } : EMPTY_PLATE }}
          body={t("PlanRecipe.replace_body", {
            previous: pending.meal.title,
            next: recipe.title,
            meal: t(SLOTS[slot].key).toLowerCase(),
            day: dayLabel(pending.date),
          })}
          isSaving={isSaving}
          onConfirm={() => void commit(pending.date)}
          onCancel={() => setPending(undefined)}
        />
      </Measured>
    );
  }

  return (
    <Scrolling>
      <InfoBanner
        variant="neutral"
        title={t("PlanRecipe.intro_title")}
        icon={ShoppingCart}
        style={[styles.intro, banner && styles.aboveBanner]}
      >
        {t("PlanRecipe.intro_body")}
      </InfoBanner>
      {banner}
      <SectionLabel label={t("PlanRecipe.portions")} value={String(servings)} style={styles.portions} />
      <StepSlider value={servings} max={MAX_SERVINGS} onChange={setServings} />
      <GroupSelect
        label={t("PlanRecipe.meal")}
        labelColor={theme.colors.neutral.muted}
        style={styles.slots}
        items={MEAL_SLOTS.map((option) => ({
          value: option,
          label: t(SLOTS[option].key),
          icon: SLOTS[option].emoji,
          selected: option === slot,
        }))}
        onSelect={(value) => setSlot(value as MealSlot)}
      />
      <SectionLabel label={t("PlanRecipe.day")} />
      <DayGrid
        days={days}
        emptyPlate={EMPTY_PLATE}
        emptyLabel={t("Status.empty")}
        dayLabel={dayLabel}
        onChoose={choose}
      />
    </Scrolling>
  );
};

/**
 * The sheet under the recipe screen's "add to my list": when, for how many, and at which meal.
 *
 * A route of its own so the recipe tabs need not carry it; its one param is untrusted and checked
 * here before a hook reads it. Tapping a day plans the dish and closes, unless a dish is already
 * on that plate, in which case the sheet asks first.
 *
 * The screen sizes the sheet itself rather than leaving it to the route, because it changes shape:
 * see `Measured` and `Scrolling`.
 */
export const PlanRecipeScreen = ({ params, onClose }: Props) => {
  const t = useTranslations("Planning");

  if (!params.recipeId) return <Nothing label={t("PlanRecipe.missing")} />;

  return <Picker recipeId={params.recipeId} onClose={onClose} />;
};

const styles = StyleSheet.create({
  page: {
    paddingTop: CHROME_HEIGHT,
    paddingBottom: Platform.select({ default: theme.spacing[32] }),
    paddingHorizontal: theme.spacing[16],
  },
  confirm: {
    paddingBottom: theme.spacing[32],
  },
  empty: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  intro: { marginTop: theme.spacing[28] },
  aboveBanner: { marginBottom: theme.spacing[16] },
  portions: { marginTop: theme.spacing[20] },
  slots: { marginTop: theme.spacing[24] },
});
