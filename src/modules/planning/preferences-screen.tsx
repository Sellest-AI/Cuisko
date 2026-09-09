import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import { GroupSelect } from "@ui/group-select";
import { Text } from "@ui/text";
import { colors, theme } from "theme";
import { useTranslations } from "translations";

import { NUTRITION_PREFERENCES, type NutritionPreference } from "@shared/preferences";

import { TAG_EMOJI } from "~/lib/vocabulary";

import { resolveSeeks } from "./_model/preferences";
import { usePreferences } from "./_hooks/usePreferences";

type Props = {
  onClose: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
};

/**
 * The tastes the plan is generated against — the `seeks` half of a person's preferences.
 *
 * Deliberately not where a diet or an allergen is answered: those aggregate across a household and
 * belong to the tunnel's constraint list, which can show whose they are. These four do not
 * aggregate at all — high-protein and low-calorie are not compatible wishes — so they are the
 * caller's alone, and this screen is the only place that asks.
 *
 * ⚠️ **They are desires, not verdicts.** PRODUCT.md's first anti-goal is that the app is not a
 * calorie policeman, and `high-calorie` is here for someone eating to gain weight exactly as
 * `low-calorie` is for someone eating to lose. Nothing may render one of these back at the cook as
 * a judgement on what they made.
 */
export const PreferencesScreen = ({ onLayout }: Props) => {
  const t = useTranslations("Planning");
  /** The words for a tag belong to the vocabulary, not to whichever screen draws it. */
  const tVocabulary = useTranslations("Vocabulary");
  const { preferences, isLoading, save } = usePreferences();

  return (
    <View onLayout={onLayout} style={styles.page}>
      {isLoading || !preferences ? (
        /**
         * A word rather than chips: the sheet is measured to its content, so drawing an unticked
         * row and then correcting it would resize the sheet under the user's thumb.
         */
        <Text.Base color={colors.muted}>{t("Preferences.loading")}</Text.Base>
      ) : (
        <GroupSelect
          label={t("Preferences.question")}
          onSelect={(value) =>
            save({ ...preferences, seeks: resolveSeeks(preferences.seeks, value as NutritionPreference) })
          }
          items={NUTRITION_PREFERENCES.map((preference) => ({
            value: preference,
            label: tVocabulary(`Tags.${preference}`),
            icon: TAG_EMOJI[preference],
            selected: preferences.seeks.includes(preference),
          }))}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  /** The sheet now ends where this column does, so the bottom padding is the sheet's own margin. */
  page: {
    paddingHorizontal: theme.spacing[16],
    paddingTop: 56,
    paddingBottom: theme.spacing[24],
  },
});
