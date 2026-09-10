import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import { GroupSelect } from "@ui/group-select";
import { Text } from "@ui/text";
import { colors, theme } from "theme";
import { useTranslations } from "translations";

import { ALLERGENS, sortAllergens, type Allergen } from "@shared/allergens";
import { DIETS, type Diet } from "@shared/diets";
import { NUTRITION_PREFERENCES, type NutritionPreference } from "@shared/preferences";

import { ALLERGEN_EMOJI, DIET_EMOJI, TAG_EMOJI } from "~/lib/vocabulary";

import { toggle } from "./_model/model";
import { resolveSeeks } from "./_model/preferences";
import { usePreferences } from "./_hooks/usePreferences";

type Props = {
  onClose: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
};

/**
 * A person's own standing answers: how they eat, what they keep off their plate, what they want to
 * see. The whole of `userPreferences`, and nothing else.
 *
 * **The split from the tunnel is by owner, not by question.** The same three vocabularies are
 * answered in both places, and neither is a duplicate of the other: the tunnel shows the
 * constraints a *table of eaters* imposes between them, captioned by where each came from, and can
 * therefore show a housemate's gluten beside your own. This sheet shows one row, the caller's,
 * with nothing inherited and nothing aggregated. It is where you assert what is yours; the tunnel
 * is where you see what the week has to satisfy.
 *
 * That is also why nothing about the kitchen is here. `equipments` lives on the household and is
 * shared by everyone in it, so a sheet about one person's tastes is the wrong place to change it.
 *
 * ⚠️ **The three groups aggregate differently, and only two of them aggregate at all.** `diet` and
 * `avoids` combine across a household, which is what gives the tunnel something to show. `seeks`
 * does not and never will: high-protein and low-calorie are not compatible wishes, so this sheet
 * is the only place the nutrition half is asked.
 *
 * ⚠️ **`seeks` are desires, not verdicts.** PRODUCT.md's first anti-goal is that the app is not a
 * calorie policeman, and `high-calorie` is here for someone eating to gain weight exactly as
 * `low-calorie` is for someone eating to lose. Nothing may render one of these back at the cook as
 * a judgement on what they made.
 */
export const PreferencesScreen = ({ onLayout }: Props) => {
  const t = useTranslations("Planning");
  /** The words for a diet, an allergen and a tag belong to the vocabulary, not to whichever screen draws it. */
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
        <>
          {/**
           * One answer, in a control that toggles. Tapping a diet REPLACES rather than toggles, so
           * the group can never be left empty — `diet` is a single column with no unanswered value,
           * and tapping the active chip is simply a write of what is already there. `omnivore` is
           * an ordinary choice in the list, not the absence of one.
           */}
          <GroupSelect
            label={t("Preferences.diet")}
            onSelect={(value) => {
              if (value !== preferences.diet) save({ ...preferences, diet: value as Diet });
            }}
            items={DIETS.map((diet) => ({
              value: diet,
              label: tVocabulary(`Diets.${diet}`),
              icon: DIET_EMOJI[diet],
              selected: preferences.diet === diet,
            }))}
          />
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
          {/**
           * Sorted into the vocabulary's own order on every tap, which is what `save` normalises to
           * server-side anyway. Left in tick order the local draft would reshuffle the chip row the
           * moment the query came back and disagreed with it.
           */}
          <GroupSelect
            label={t("Preferences.avoids")}
            onSelect={(value) =>
              save({ ...preferences, avoids: sortAllergens(toggle(preferences.avoids, value as Allergen)) })
            }
            items={ALLERGENS.map((allergen) => ({
              value: allergen,
              label: tVocabulary(`Allergens.${allergen}`),
              icon: ALLERGEN_EMOJI[allergen],
              selected: preferences.avoids.includes(allergen),
            }))}
          />
        </>
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
    gap: theme.spacing[24],
  },
});
