import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated from "react-native-reanimated";

import { StepSlider } from "@ui/step-slider";
import { Text } from "@ui/text";
import { colors, theme } from "theme";
import { useTranslations } from "translations";

import { CUISKO } from "~/lib/mascots";
import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { MAX_DAYS, MEAL_SLOTS, type MealSlot } from "../_model/model";
import { resetTunnelAtom } from "../_hooks/atoms";
import { useTunnel } from "./_hooks/useTunnel";
import { useTunnelScrollHandler } from "./_hooks/useTunnelScrollHandler";
import { SectionLabel } from "../_components/section-label";
import { ChoiceRows } from "./_components/choice-rows";
import { TunnelHeader } from "./_components/tunnel-header";

const GUTTER = theme.spacing[16];
const MAX_PEOPLE = 10;

/**
 * Named keys rather than `t(`Meal.${slot}`)`: the template form types as `string` at the call
 * site, so a slot added without its copy would compile and ship the key itself as the label.
 *
 * The glyph reads as the time of day rather than the food, because that is what the question is
 * asking: a sandwich beside "lunch" suggests the plan will serve one.
 */
const SLOTS = {
  lunch: { key: "Meal.lunch", emoji: "☀️" },
  dinner: { key: "Meal.dinner", emoji: "🌙" },
} as const satisfies Record<MealSlot, { key: string; emoji: string }>;

/** What this week is, who is eating, and what the kitchen can do. */
export const TunnelSetup = () => {
  const t = useTranslations("Planning");
  const { people, setPeople, days, setDays, slots, toggleSlot, isSeedLoading } =
    useTunnel();
  const resetTunnel = useSetAtom(resetTunnelAtom);
  const onScroll = useTunnelScrollHandler();

  /**
   * Entering the first step starts a run, so whatever the last one left behind goes now. The
   * atoms outlive the tunnel, and a second run would otherwise open on the previous week's meals.
   */
  useEffect(() => resetTunnel(), [resetTunnel]);

  return (
    <Animated.ScrollView
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <TunnelHeader
        title={t("Tunnel.Setup.title")}
        subtitle={t("Tunnel.Setup.subtitle")}
        mascot={CUISKO.calendar}
      />
      {isSeedLoading ? (
        /**
         * The form waits for the seed rather than opening on the offer and correcting itself.
         *
         * These answers are prefilled from the household, and a seed landing a moment after the
         * screen did would move a slider the user had already dragged — silently, and then write
         * that value back at the end of the tunnel. A short wait is the honest version of "opens
         * already knowing how the household eats"; the diet step waits for the same reason.
         */
        <Text.Base color={colors.muted}>{t("Tunnel.Setup.loading")}</Text.Base>
      ) : (
        <>
          {/** Notes are removed for now, until implemented. */}
          <SectionLabel
            label={t("Tunnel.Setup.meals")}
            style={{ marginTop: theme.spacing[4] }}
          />
          <ChoiceRows
            options={MEAL_SLOTS.map((slot) => ({
              id: slot,
              label: t(SLOTS[slot].key),
              emoji: SLOTS[slot].emoji,
            }))}
            selected={slots}
            onToggle={toggleSlot}
          />
          <SectionLabel label={t("Tunnel.Setup.people")} value={String(people)} />
          <StepSlider value={people} max={MAX_PEOPLE} onChange={setPeople} style={styles.slider} />
          <SectionLabel label={t("Tunnel.Setup.days")} value={String(days)} />
          <StepSlider value={days} max={MAX_DAYS} onChange={setDays} style={styles.slider} />
        </>
      )}
    </Animated.ScrollView>
  );
};

const styles = StyleSheet.create({
  /** Clears the tunnel bar, which floats over the page rather than sitting in it. */
  page: { paddingBottom: NAVIGATION_BAR_OFFSET, paddingHorizontal: GUTTER },
  slider: { marginBottom: theme.spacing[4] },
});
