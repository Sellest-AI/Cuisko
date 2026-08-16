import { StyleSheet, useWindowDimensions, View } from "react-native";

import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

import { IngredientGroup } from "./_components/ingredient-group";
import { stepNumber } from "./_model/step";
import { columnWidth } from "./constants";

type Props = {
  /** 1-based, because it is what the cook reads — the array index is the screen's business. */
  position: number;
  /** The final step, badged so the cook sees the end coming before the bar changes shape. */
  isLast?: boolean;
  /** Already written for display — "15 minutes". */
  duration: string;
  instruction: string;
  /** What this step alone calls for, not the whole recipe. */
  ingredients: { emoji: string; name: string; quantity: string }[];
};

/** Wide enough for a name to sit on one line at this text size. */
const COLUMNS = 3;

/** One step of the method, spelled out: what to do, how long it takes, what it takes. */
export const StepCard = ({ position, duration, instruction, ingredients, isLast }: Props) => {
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
        <Text.Base color={theme.colors.neutral.muted}>{duration}</Text.Base>
      </View>
      <Text.Body color={theme.colors.foreground} style={styles.instruction}>
        {instruction}
      </Text.Body>
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

const styles = StyleSheet.create({
  card: { gap: theme.spacing[20] },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  instruction: { flexShrink: 1 },
});
