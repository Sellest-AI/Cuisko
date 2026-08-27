import { StyleSheet, useWindowDimensions, View } from "react-native";

import { SparklesIcon } from "@ui/icons";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

import { IngredientGroup } from "../_components/ingredient-group";
import { stepNumber } from "../_model/step";
import { columnWidth } from "../constants";

type Props = {
  /** 1-based, because it is what the cook reads — the array index is the screen's business. */
  position: number;
  /** The final step, badged so the cook sees the end coming before the bar changes shape. */
  isLast?: boolean;
  /** The title of the step. */
  title?: string;
  instruction: string;
  /** What this step alone calls for, not the whole recipe. */
  ingredients: { emoji: string; name: string; quantity: string }[];
  /** Optional hint */
  hint?: string;
};

/** Wide enough for a name to sit on one line at this text size. */
const COLUMNS = 3;

/** One step of the method, spelled out: what to do, how long it takes, what it takes. */
export const StepCard = ({ position, title, instruction, ingredients, isLast, hint }: Props) => {
  const t = useTranslations("Recipe");
  const { width } = useWindowDimensions();

  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <Text.H4 color={theme.colors.neutral.muted}>
          {stepNumber(position)}
          {isLast && <Text.Base style={{ marginLeft: theme.spacing[8] }} color={theme.colors.primary.base}>
            {t("Cooking.last_step")}
          </Text.Base>}
        </Text.H4>
        {title && <Text.Base color={theme.colors.neutral.muted}>{title}</Text.Base>}
      </View>
      <Text.Body color={theme.colors.foreground} style={styles.instruction}>
        {instruction}
      </Text.Body>
      {hint && <View style={styles.hint}>
        <SparklesIcon size={16} color={theme.colors.primary.base} />
        <Text.Body
          color={theme.colors.primary.base}
          style={styles.instruction}
        >
          {hint}
        </Text.Body>
      </View>}
      {ingredients.length > 0 && (
        <IngredientGroup
          title={t("Cooking.step_ingredients")}
          items={ingredients}
          itemWidth={columnWidth(width, COLUMNS)}
        />
      )}
    </View>
  );
};

type PrepCardProps = {
  /** Every line the recipe calls for, so there is nothing left to fetch once cooking starts. */
  ingredients: { emoji: string; name: string; quantity: string }[];
};

/**
 * The session's own first page — mise en place before the method starts.
 *
 * A separate card rather than `StepCard` with `stepIngredients` set to everything: this page has
 * no position to read aloud and nothing to do but gather, so borrowing the step layout would leave
 * a numbered heading and a hint slot with nothing to put in them.
 */
export const PrepCard = ({ ingredients }: PrepCardProps) => {
  const t = useTranslations("Recipe");
  const { width } = useWindowDimensions();

  return (
    <View style={styles.card}>
      <Text.H4 color={theme.colors.neutral.muted}>{t("Ingredients.title")}</Text.H4>
      <Text.Body color={theme.colors.foreground} style={styles.instruction}>
        {t("Cooking.prep_instruction")}
      </Text.Body>
      {ingredients.length > 0 && (
        <IngredientGroup
          title={t("Cooking.all_ingredients")}
          items={ingredients}
          itemWidth={columnWidth(width, COLUMNS)}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { gap: theme.spacing[20] },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  instruction: { flexShrink: 1, width: "100%" },
  hint: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "flex-start",
    gap: theme.spacing[8],
  }
});
