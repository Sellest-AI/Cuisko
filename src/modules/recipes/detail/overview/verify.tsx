import { View, StyleSheet, ViewProps } from "react-native";

import { theme } from "theme";
import { useTranslations } from "translations";
import { isAppError, isRateLimited } from "@shared/errors";
import { useNow } from "@ui/hooks/useNow";
import { StepProgress } from "@ui/step-progress";
import { Text } from "@ui/text";

import { useVerifyRecipe } from "../../_hooks/useVerifyRecipe";

/** How long the bar takes to fill: about what a check costs. One that runs longer waits on a full bar. */
const EXPECTED_SECONDS = 60;

/**
 * The admin's check against the original, last on the overview: the bar while it runs, and what it
 * said once it has. The check itself is started from the header's `…` menu; both read the same
 * entry of `verificationsAtom`, so the bar appears here the moment the menu starts it.
 *
 * Draws nothing for a cook who is not an admin, and nothing before a check has been run.
 */
export const Verify = ({ id, style }: { id?: string; style?: ViewProps["style"] }) => {
  const t = useTranslations("Recipe");
  const { canVerify, startedAt, outcome, error } = useVerifyRecipe(id);

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

  if (startedAt === undefined && lines.length === 0) return null;

  return (
    <View style={[styles.container, style]}>
      {startedAt !== undefined && <VerifyProgress startedAt={startedAt} />}
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
