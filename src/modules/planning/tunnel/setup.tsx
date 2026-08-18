import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated from "react-native-reanimated";

import { CardChoice } from "@ui/cards/choice";
import { StepSlider } from "@ui/step-slider";
import { TextField } from "@ui/text-field";
import { ToggleRow } from "@ui/toggle-row";
import { theme } from "theme";
import { useTranslations } from "translations";

import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { MAX_DAYS, MEAL_SLOTS, type MealSlot } from "../_model/model";
import { resetTunnelAtom } from "../_hooks/atoms";
import { TILE_IMAGE, UTENSILS } from "../_hooks/placeholders";
import { useTunnel } from "../_hooks/useTunnel";
import { useTunnelScrollHandler } from "../_hooks/useTunnelScrollHandler";
import { SectionLabel } from "../_components/section-label";
import { TunnelHeader } from "../_components/tunnel-header";

const COLUMNS = 2;
const GUTTER = theme.spacing[16];
const GAP = theme.spacing[12];
const MAX_PEOPLE = 10;

/**
 * Named keys rather than `t(`Meal.${slot}`)`: the template form types as `string` at the call
 * site, so a slot added without its copy would compile and ship the key itself as the label.
 */
const SLOT_LABELS = { lunch: "Meal.lunch", dinner: "Meal.dinner" } as const satisfies Record<
  MealSlot,
  string
>;

/** Step 1 — what this week is, who is eating, and what the kitchen can do. */
export const TunnelSetup = () => {
  const t = useTranslations("Planning");
  const { width } = useWindowDimensions();
  const { note, setNote, people, setPeople, days, setDays, slots, toggleSlot, utensils, toggleUtensil } =
    useTunnel();
  const resetTunnel = useSetAtom(resetTunnelAtom);
  const onScroll = useTunnelScrollHandler();

  /**
   * Entering the first step starts a run, so whatever the last one left behind goes now. The
   * atoms outlive the tunnel, and a second run would otherwise open on the previous week's meals.
   */
  useEffect(() => resetTunnel(), [resetTunnel]);

  const tileWidth = (width - GUTTER * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  return (
    <Animated.ScrollView
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <TunnelHeader title={t("Tunnel.Setup.title")} />
      <TextField
        multiline
        value={note}
        onChangeText={setNote}
        placeholder={t("Tunnel.Setup.placeholder")}
        style={styles.note}
      />
      <SectionLabel label={t("Tunnel.Setup.people")} value={String(people)} />
      <StepSlider value={people} max={MAX_PEOPLE} onChange={setPeople} style={styles.slider} />
      <SectionLabel label={t("Tunnel.Setup.days")} value={String(days)} />
      <StepSlider value={days} max={MAX_DAYS} onChange={setDays} style={styles.slider} />
      <SectionLabel label={t("Tunnel.Setup.meals")} />
      <ToggleRow
        options={MEAL_SLOTS.map((slot) => ({ id: slot, label: t(SLOT_LABELS[slot]) }))}
        selected={slots}
        onToggle={toggleSlot}
      />
      <SectionLabel
        label={t("Tunnel.Setup.utensils")}
        value={`${utensils.length}/${UTENSILS.length}`}
      />
      <View style={styles.grid}>
        {UTENSILS.map((utensil) => (
          <CardChoice
            key={utensil.id}
            label={utensil.label}
            imageSrc={TILE_IMAGE}
            style={{ width: tileWidth - 1 }}
            selected={utensils.includes(utensil.id)}
            onPress={() => toggleUtensil(utensil.id)}
            elevated
          />
        ))}
      </View>
    </Animated.ScrollView>
  );
};

const NOTE_MIN_HEIGHT = 120;

const styles = StyleSheet.create({
  /** Clears the tunnel bar, which floats over the page rather than sitting in it. */
  page: { paddingBottom: NAVIGATION_BAR_OFFSET, paddingHorizontal: GUTTER },
  note: {
    minHeight: NOTE_MIN_HEIGHT,
    textAlignVertical: "top",
    paddingTop: theme.spacing[16],
  },
  slider: { marginBottom: theme.spacing[4] },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
  },
});
