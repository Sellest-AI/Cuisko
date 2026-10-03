import { View, StyleSheet } from "react-native";

import { theme } from "theme";
import { useTranslations } from "translations";
import { isAppError, isRateLimited } from "@shared/errors";
import { Button } from "@ui/button";
import { Text } from "@ui/text";

import { useVerifyRecipe } from "../../_hooks/useVerifyRecipe";

/**
 * A second tap within this is dropped. `isLoading` disables the button only once the screen has
 * drawn the check as running, and a double tap lands before that: it would pay for two checks.
 */
const DOUBLE_TAP_DELAY_MS = 1000;

/**
 * The admin's "Verify the recipe", last on the overview, and what the check said under it.
 *
 * A ghost button, because it is a tool and not part of the recipe: it should be findable by the
 * person who needs it and invisible to the eye of everyone else. Draws nothing for a cook who is
 * not an admin.
 */
export const Verify = ({ id }: { id?: string }) => {
  const t = useTranslations("Recipe");
  const { canVerify, isVerifying, outcome, error, verify } = useVerifyRecipe(id);

  if (!canVerify) return null;

  /** A recipe with no page, and a limit to wait out, each say so: the rest is a check to run again. */
  const failure = !error ? undefined :
    isAppError(error) && error.data.code === "INVALID_INPUT" ? t("Overview.verify_no_source") :
      isRateLimited(error) ? t("Overview.verify_rate_limited") :
        t("Overview.verify_failed");

  const lines =
    failure ? [failure] :
      outcome?.verdict === "unchanged" ? [t("Overview.verify_unchanged")] :
        outcome?.corrections ?? [];

  return (
    <View style={styles.container}>
      <Button variant="ghost" onPress={() => void verify()} isLoading={isVerifying} doubleTapDelay={DOUBLE_TAP_DELAY_MS}>
        {t("Overview.verify")}
      </Button>
      {lines.map((line, index) => (
        <Text.Sm key={index} color={theme.colors.neutral.muted} style={styles.line}>
          {line}
        </Text.Sm>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: theme.spacing[4],
    marginTop: theme.spacing[24],
    paddingHorizontal: theme.spacing[16],
  },
  line: { textAlign: "center" },
});
