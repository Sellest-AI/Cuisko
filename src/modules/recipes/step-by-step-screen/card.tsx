import { StyleSheet, useWindowDimensions, View } from "react-native";

import { Lightbulb } from "@ui/icons";
import { InfoBanner } from "@ui/info-banner";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

import { IngredientGroup } from "../_components/ingredient-group";
import { InstructionText } from "../_components/instruction-text";
import type { RecipeLine } from "../_model/detail";
import { stepNumber } from "../_model/step";
import { columnWidth } from "../constants";

/**
 * A line as either card draws it — the tile's photo when the catalog has one, its emoji otherwise.
 *
 * One type rather than the same three fields written at both cards: they hand it to the same
 * `IngredientGroup`, so a field added for one and not the other is a tile that draws differently
 * on the step page than on the mise en place above it.
 */
type StepIngredient = { emoji: string; name: string; quantity: string; imageUrl?: string };

type Props = {
  /** 1-based, because it is what the cook reads — the array index is the screen's business. */
  position: number;
  /** The final step, badged so the cook sees the end coming before the bar changes shape. */
  isLast?: boolean;
  /** The title of the step. */
  title?: string;
  instruction: string;
  /** The recipe's ingredient lines, which decide which amounts in the instruction are bold. */
  lines: RecipeLine[];
  /** What this step alone calls for, not the whole recipe. */
  ingredients: StepIngredient[];
  /** The cook's tips for this step, one banner each, drawn under the instruction. */
  hints?: string[];
};

/** Wide enough for a name to sit on one line at this text size. */
const COLUMNS = 3;

/** One step of the method, spelled out: what to do, how long it takes, what it takes. */
export const StepCard = ({ position, title, instruction, lines, ingredients, isLast, hints }: Props) => {
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
      <InstructionText instruction={instruction} lines={lines} style={styles.instruction} />
      {hints?.map((hint, index) => (
        /** Hints may repeat and carry no id, so the position is the only stable key. */
        <InfoBanner key={index} variant="tip" icon={Lightbulb} title={t("Cooking.hint_title")}>
          {hint}
        </InfoBanner>
      ))}
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
  ingredients: StepIngredient[];
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
});
