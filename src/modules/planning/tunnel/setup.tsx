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

import { EQUIPMENTS } from "@shared/equipments";

import { EQUIPMENT_EMOJI } from "~/lib/vocabulary";
import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { MAX_DAYS, MEAL_SLOTS, type MealSlot } from "../_model/model";
import { resetTunnelAtom } from "../_hooks/atoms";
import { useTunnel } from "./_hooks/useTunnel";
import { useTunnelScrollHandler } from "./_hooks/useTunnelScrollHandler";
import { SectionLabel } from "../_components/section-label";
import { TunnelHeader } from "./_components/tunnel-header";

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
  /**
   * The kitchen's words come from the recipe namespace, because the vocabulary is one and the
   * words for it already live there. They move to a namespace of their own — `Vocabulary.*`,
   * shared by both — with the rest of the shared vocabularies; this call is the placeholder for it.
   */
  const tEquipment = useTranslations("Recipe");
  const { width } = useWindowDimensions();
  const { note, setNote, people, setPeople, days, setDays, slots, toggleSlot, equipments, toggleEquipment } =
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
        label={t("Tunnel.Setup.equipments")}
        value={`${equipments.length}/${EQUIPMENTS.length}`}
      />
      <View style={styles.grid}>
        {EQUIPMENTS.map((equipment) => (
          <CardChoice
            key={equipment}
            label={tEquipment(`Equipments.${equipment}`)}
            emoji={EQUIPMENT_EMOJI[equipment]}
            style={{ width: tileWidth - 1 }}
            selected={equipments.includes(equipment)}
            onPress={() => toggleEquipment(equipment)}
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
