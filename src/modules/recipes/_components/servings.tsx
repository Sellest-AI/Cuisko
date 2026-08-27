import { View, StyleSheet, ViewStyle } from "react-native";

import { ButtonIcon } from "@ui/button-icon";
import { Minus, Plus } from "@ui/icons";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

type Props = {
  servings: number;
  onChange: (servings: number) => void;
  style?: ViewStyle;
};

/** How many people the quantities below are scaled for. */
export const Servings = ({ servings, onChange, style }: Props) => {
  const t = useTranslations("Recipe");

  return (
    <View style={[styles.servings, style]}>
      <Text.Lg>{t("Ingredients.servings")}</Text.Lg>
      <View style={styles.stepper}>
        <ButtonIcon
          style={styles.stepButton}
          iconSize={STEP_ICON_SIZE}
          variant="primary-subtle"
          size="sm"
          disabled={servings <= MIN_SERVINGS}
          onPress={() => onChange(servings - 1)}
        >
          {Minus}
        </ButtonIcon>
        <Text.Base>{servings}</Text.Base>
        <ButtonIcon
          style={styles.stepButton}
          iconSize={STEP_ICON_SIZE}
          variant="primary-subtle"
          size="sm"
          onPress={() => onChange(servings + 1)}
        >
          {Plus}
        </ButtonIcon>
      </View>
    </View>
  );
};

/**
 * What the minus greys out at.
 *
 * The floor itself is enforced by `useRecipe`'s setter, which is what stops a second stepper
 * restating it. This one is presentation: the button has to look unavailable a tap *before* the
 * clamp would silently swallow the press.
 */
const MIN_SERVINGS = 1;

/** The stepper's discs are smaller than any `size` gives, so both dimensions are set by hand. */
const STEP_ICON_SIZE = 12;

const styles = StyleSheet.create({
  servings: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[8],
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
  },
  stepButton: { padding: theme.spacing[6] },
});
