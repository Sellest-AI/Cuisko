import { View, StyleSheet, ViewStyle } from "react-native";

import { GroupSelect } from "@ui/group-select";
import { StepSlider } from "@ui/step-slider";
import { Text } from "@ui/text";
import { colors, theme } from "theme";
import { useTranslations } from "translations";

import { CUISINES, type Cuisine } from "@shared/cuisines";
import { EQUIPMENTS, type Equipment } from "@shared/equipments";
import { toggle } from "@shared/helpers";
import { DIFFICULTY_LEVELS, difficultyKey, type DifficultyLevel, type Timings } from "@shared/recipes";
import { AUTHORED_TAGS, type AuthoredTag, type ComputedTag } from "@shared/tags";

import { EQUIPMENT_EMOJI, TAG_EMOJI } from "~/lib/vocabulary";

import type { EditorDetails } from "../_model/editor";
import { DurationField } from "./details.duration";

type Props = {
  details: EditorDetails;
  /** The recipe's computed tags, drawn locked beside the ones the cook can toggle. */
  computedTags: ComputedTag[];
  onChange: (details: EditorDetails) => void;
  style?: ViewStyle;
};

/**
 * Everything below the ingredients: the five things the agent guessed on the first save, and which
 * the cook may now correct by hand without the agent running again.
 *
 * Edit only — the screen mounts this for an existing recipe and never on a create, where there is
 * nothing to correct yet and the whole point is pasting a recipe in and pressing save.
 */
export const EditorDetailFields = ({ details, computedTags, onChange, style }: Props) => {
  const t = useTranslations("Recipe");
  /** The words for a utensil, a tag and a cuisine belong to the vocabulary, not to this screen. */
  const tVocabulary = useTranslations("Vocabulary");

  const setTiming = (key: keyof Timings) => (minutes: number | undefined) =>
    onChange({ ...details, timings: { ...details.timings, [key]: minutes } });

  return (
    <View style={[styles.block, style]}>
      <GroupSelect
        label={t("Editor.utensils")}
        onSelect={(value) =>
          onChange({ ...details, equipments: toggle(details.equipments, value as Equipment) })
        }
        items={EQUIPMENTS.map((equipment) => ({
          value: equipment,
          label: tVocabulary(`Equipments.${equipment}`),
          icon: EQUIPMENT_EMOJI[equipment],
          selected: details.equipments.includes(equipment),
        }))}
      />
      <View style={styles.section}>
        {/*
          * The gutter is the row's, not the label's: `Text` turns a margin into a sibling spacer on
          * native, and a third child is what `space-between` centres the label between.
          */}
        <View style={styles.difficulty}>
          <Text.Lg>{t("Editor.difficulty")}</Text.Lg>
          <Text.Base color={colors.neutral.muted}>
            {t(`Difficulties.${difficultyKey(details.difficulty)}`)}
          </Text.Base>
        </View>
        <StepSlider
          value={details.difficulty}
          max={DIFFICULTY_LEVELS.length}
          onChange={(level) => onChange({ ...details, difficulty: level as DifficultyLevel })}
        />
      </View>
      <View style={styles.section}>
        <Text.Lg>{t("Editor.timings")}</Text.Lg>
        <DurationField
          emoji="🍪"
          label={t("Overview.preparation")}
          minutes={details.timings.preparation}
          onChange={setTiming("preparation")}
        />
        <DurationField
          emoji="🔥"
          label={t("Overview.cooking")}
          minutes={details.timings.cooking}
          onChange={setTiming("cooking")}
        />
        <DurationField
          emoji="😴"
          label={t("Overview.resting")}
          minutes={details.timings.resting}
          onChange={setTiming("resting")}
        />
      </View>
      <GroupSelect
        label={t("Editor.tags")}
        onSelect={(value) => onChange({ ...details, tags: toggle(details.tags, value as AuthoredTag) })}
        items={AUTHORED_TAGS.map((tag) => ({
          value: tag,
          label: tVocabulary(`Tags.${tag}`),
          icon: TAG_EMOJI[tag],
          selected: details.tags.includes(tag),
        }))}
      />
      {/*
        * Shown rather than hidden: the recipe page lists these too, and a cook who finds two of its
        * tags missing here would read that as a bug. Locked says where they came from.
        */}
      {computedTags.length > 0 && (
        <GroupSelect
          label={t("Editor.computed_tags")}
          labelColor={colors.neutral.muted}
          onSelect={() => undefined}
          items={computedTags.map((tag) => ({
            value: tag,
            label: tVocabulary(`Tags.${tag}`),
            icon: TAG_EMOJI[tag],
            locked: true,
          }))}
        />
      )}
      {/*
        * Tapping the active chip writes what is already there rather than clearing it: `cuisine` is
        * a required column with no unanswered value — the preferences sheet's rule for `diet`. Last,
        * because two dozen chips is the longest row on the screen.
        */}
      <GroupSelect
        label={t("Editor.cuisine")}
        onSelect={(value) => {
          if (value !== details.cuisine) onChange({ ...details, cuisine: value as Cuisine });
        }}
        items={CUISINES.map((cuisine) => ({
          value: cuisine,
          label: tVocabulary(`Cuisines.${cuisine}`),
          selected: details.cuisine === cuisine,
        }))}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  block: { gap: theme.spacing[28] },
  section: { gap: theme.spacing[12] },
  difficulty: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: theme.spacing[8],
    paddingRight: theme.spacing[4],
  },
});
