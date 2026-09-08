import { LayoutChangeEvent, ScrollView, StyleSheet, View } from "react-native";

import { GroupSelect } from "@ui/group-select";
import { theme } from "theme";
import { useTranslations } from "translations";

import { EQUIPMENTS, type Equipment } from "@shared/equipments";

import { EQUIPMENT_EMOJI } from "~/lib/vocabulary";

import { ALLERGIES, DIETS } from "./_hooks/placeholders";
import { usePreferences } from "./_hooks/usePreferences";

type Props = {
  onClose: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
};

/**
 * The kitchen's standing profile: how the household eats, what it must never be served, and what
 * it can cook with.
 *
 * These three and not the tunnel's other questions, because only these three are still true next
 * week. Mood, focus and cooking time are answers to "this week" — a standing copy of them here
 * would be a second source contradicting whatever the last run collected, with nothing to say
 * which was the real one.
 *
 * The same atoms the tunnel's steps write, so this sheet and the tunnel are two doors onto one
 * fact rather than two facts (`usePreferences`).
 */
export const PreferencesScreen = ({ onLayout }: Props) => {
  const t = useTranslations("Planning");
  /** The kitchen's words belong to the vocabulary, not to whichever screen draws it. */
  const tVocabulary = useTranslations("Vocabulary");
  const { diets, allergies, equipments, toggleDiet, toggleAllergy, toggleEquipment } = usePreferences();

  /** The chips are drawn from the catalogue and marked from the answer, so the two cannot disagree. */
  const chips = (options: readonly { id: string; label: string; emoji: string }[], selected: string[]) =>
    options.map((option) => ({
      value: option.id,
      label: option.label,
      icon: option.emoji,
      selected: selected.includes(option.id),
    }));

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View onLayout={onLayout} style={styles.page}>
        <GroupSelect
          label={t("Preferences.diet")}
          onSelect={toggleDiet}
          items={chips(DIETS, diets)}
        />
        <GroupSelect
          label={t("Preferences.allergies")}
          onSelect={toggleAllergy}
          items={chips(ALLERGIES, allergies)}
        />
        <GroupSelect
          label={t("Preferences.utensils")}
          onSelect={(value) => toggleEquipment(value as Equipment)}
          items={EQUIPMENTS.map((equipment) => ({
            value: equipment,
            label: tVocabulary(`Equipments.${equipment}`),
            icon: EQUIPMENT_EMOJI[equipment],
            selected: equipments.includes(equipment),
          }))}
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  /**
   * `onLayout` sits on this inner column, not on the `ScrollView` around it.
   *
   * The sheet sizes itself to whatever reports its height, and a scroller's own height is the one
   * the sheet just gave it — measuring there is a loop that never sees the chips. Measured from the
   * content, a short profile gets a sheet cut to it, and one past `MODAL_MAX_DETENT` gets a sheet
   * clamped to the cap with the scroller taking up the remainder.
   */
  page: {
    paddingHorizontal: theme.spacing[16],
    paddingTop: 56,
    paddingBottom: theme.spacing[24],
    gap: theme.spacing[24],
  },
});
