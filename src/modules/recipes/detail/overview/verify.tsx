import { View, StyleSheet, ViewProps } from "react-native";

import { theme } from "theme";
import { useTranslations } from "translations";
import { isAppError, isRateLimited } from "@shared/errors";
import { Button } from "@ui/button";
import { useNow } from "@ui/hooks/useNow";
import { StepProgress } from "@ui/step-progress";
import { Text } from "@ui/text";

import { useVerifyRecipe } from "../../_hooks/useVerifyRecipe";

/**
 * A second tap within this is dropped. The bar replaces the button only once the screen has drawn
 * the check as running, and a double tap lands before that: it would pay for two checks.
 */
const DOUBLE_TAP_DELAY_MS = 1000;

/** How long the bar takes to fill: about what a check costs. One that runs longer waits on a full bar. */
const EXPECTED_SECONDS = 60;

/**
 * The admin's "Verify the recipe", last on the overview, and what the check said under it.
 *
 * A ghost button, because it is a tool and not part of the recipe: it should be findable by the
 * person who needs it and invisible to the eye of everyone else. Draws nothing for a cook who is
 * not an admin.
 */
export const Verify = ({ id, style }: { id?: string; style?: ViewProps["style"] }) => {
  const t = useTranslations("Recipe");
  const { canVerify, startedAt, outcome, error, verify } = useVerifyRecipe(id);

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
    <View style={[styles.container, style]}>
      {startedAt !== undefined ? <VerifyProgress startedAt={startedAt} /> : (
        <Button variant="ghost" onPress={() => void verify()} doubleTapDelay={DOUBLE_TAP_DELAY_MS}>
          {t("Overview.verify")}
        </Button>
      )}
      {lines.map((line, index) => (
        <Text.Sm key={index} color={theme.colors.neutral.muted} style={styles.line}>
          {line}
        </Text.Sm>
      ))}
    </View>
  );
};

/**
 * The running check, as a bar filling over `EXPECTED_SECONDS`.
 *
 * Counted from `startedAt` rather than from mount, so leaving mid-check and coming back draws the
 * bar where it would have been, not empty again.
 */
const VerifyProgress = ({ startedAt }: { startedAt: number }) => {
  const now = useNow(true);

  const seconds = Math.floor((now - startedAt) / 1000);

  return <StepProgress
    step={seconds}
    total={EXPECTED_SECONDS}
    curve="log"
    style={styles.progress}
  />;
};

const styles = StyleSheet.create({
  container: {
    alignSelf: "center",
    alignItems: "center",
    gap: theme.spacing[4],
    paddingHorizontal: theme.spacing[16],
    maxWidth: 320,
  },
  line: { textAlign: "center" },
  progress: { alignSelf: "center", width: 120, marginTop: theme.spacing[12] },
});
