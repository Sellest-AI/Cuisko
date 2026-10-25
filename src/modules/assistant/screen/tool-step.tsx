import { StyleSheet, View } from "react-native";
import { useTranslations } from "translations";

import { Text } from "@ui/text";
import { theme } from "theme";

import type { StepTool, ToolStep as Step } from "../_model/chatMessage";

/** What a status line can say. A finished call splits in three: "3 found", "found", "none". */
type StepLine = "running" | "done" | "found" | "none" | "failed";

/**
 * The emoji in front of each line, per tool.
 *
 * Here rather than in the translations: an emoji is not a word and does not change with the
 * locale, so tuning one is one edit in one place, not one per language. A `Record` over `StepTool`
 * so a new step tool cannot ship without its set.
 */
const EMOJI: Record<StepTool, Record<StepLine, string>> = {
  searchRecipes: {
    running: "🔍",
    done: "🥗",
    found: "🥗",
    none: "🔍",
    failed: "⚠️",
  },
  searchIngredients: {
    running: "🔍",
    done: "🥕",
    found: "🥕",
    none: "🔍",
    failed: "⚠️",
  },
  computeNutrition: {
    running: "🧮",
    done: "📊",
    found: "📊",
    none: "📊",
    failed: "⚠️",
  },
  findWebRecipe: {
    running: "🔍",
    done: "🥘",
    found: "🥘",
    none: "🔍",
    failed: "⚠️",
  },
};

const _lineOf = (step: Step): StepLine => {
  if (step.status !== "done") return step.status;
  if (step.count === undefined) return "found";
  return step.count === 0 ? "none" : "done";
};

type Props = {
  step: Step;
};

/**
 * One line saying what Cuisko is doing, or did: "🔍 Je cherche des recettes…", then
 * "🥗 3 recettes trouvées".
 *
 * **It stays after the turn ends**, muted, above the answer. The conversation is a record, and
 * "searched, found three, showed two" is part of what happened. A line that vanished the moment the
 * answer landed would make the cards look like they came from nowhere.
 */
export const ToolStep = ({ step }: Props) => {
  const t = useTranslations("Assistant");
  const line = _lineOf(step);

  const label = line === "done" && step.count !== undefined
    ? t(`steps.${step.tool}.done`, { count: step.count })
    : t(`steps.${step.tool}.${line}`);

  return (
    <View style={styles.row}>
      <Text.Base>{EMOJI[step.tool][line]}</Text.Base>
      <Text.Base color={theme.colors.neutral.muted} style={styles.label}>
        {label}
      </Text.Base>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[8],
    paddingHorizontal: theme.spacing[16],
    paddingBottom: theme.spacing[6],
    marginBottom: theme.spacing[8],
  },
  /** Takes the rest of the row, so a long line wraps under itself rather than under the emoji. */
  label: {
    flexShrink: 1,
    fontWeight: 400
  },
});
