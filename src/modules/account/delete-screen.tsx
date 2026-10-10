import type { LayoutChangeEvent } from "react-native";
import { StyleSheet, View } from "react-native";

import { Button } from "@ui/button";
import { ButtonPill } from "@ui/button-pill";
import { useArmedPress } from "@ui/hooks/useArmedPress";
import { Text } from "@ui/text";
import { colors, theme } from "theme";
import { useTranslations } from "translations";

import { useLocale } from "~/hooks/useLocale";
import { MODAL_CHROME_OFFSET } from "~/modules/navigation/constants";

import { useDeleteAccount } from "./_hooks/useDeleteAccount";

type Props = {
  /** Dismisses the sheet. The route owns how. */
  onClose: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
};

/**
 * The sheet that asks whether to delete the account.
 *
 * Everything is said before the second tap, the date included: confirming signs the cook out, so
 * there is no screen after it. What it promises is what the purge does, so the lists below are
 * written from that, not from what sounds gentle.
 */
export const DeleteAccountScreen = ({ onClose, onLayout }: Props) => {
  const t = useTranslations("Account");
  const locale = useLocale();
  const { dueAt, isRequesting, hasError, request } = useDeleteAccount({ onSignOutFailed: onClose });
  const { isArmed, onPress, doubleTapDelay } = useArmedPress(() => void request());

  // Spelled out field by field, as elsewhere in the app: `dateStyle` is not one Hermes can be
  // trusted with, and a numeric fallback (11/2/2026) is ambiguous on the one date that matters here.
  const date = new Date(dueAt).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });

  return (
    <View onLayout={onLayout} style={styles.container}>
      <Text.H4 style={styles.centered}>{t("Delete.title")}</Text.H4>

      <View style={styles.section}>
        <Text.Base>{t("Delete.erased_title")}</Text.Base>
        <Text.Base color={theme.colors.muted}>{t("Delete.erased")}</Text.Base>
      </View>
      <View style={styles.section}>
        <Text.Base>{t("Delete.kept_title")}</Text.Base>
        <Text.Base color={theme.colors.muted}>{t("Delete.kept")}</Text.Base>
      </View>
      <Text.Base>{t("Delete.grace_x_date", { date })}</Text.Base>

      <View style={styles.actions}>
        <Button
          variant="neutral"
          onPress={onPress}
          isLoading={isRequesting}
          disabled={isRequesting}
          doubleTapDelay={doubleTapDelay}
          style={[styles.destructive, styles.button]}
        >
          {t(isArmed ? "Delete.confirm_armed" : "Delete.confirm")}
        </Button>
        {hasError && <Text.Sm style={styles.error}>{t("Delete.error")}</Text.Sm>}
        <ButtonPill variant="neutral" size="lg" onPress={onClose} style={styles.button}>
          {t("Delete.keep")}
        </ButtonPill>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  /** Auto-height: `useMeasuredModalSheet` measures this column, so it must not be `flex: 1`. */
  container: {
    gap: theme.spacing[28],
    paddingHorizontal: theme.spacing[24],
    paddingTop: MODAL_CHROME_OFFSET,
    paddingBottom: theme.spacing[8],
  },
  centered: { textAlign: "center" },
  section: { gap: theme.spacing[4] },
  actions: { gap: theme.spacing[12], marginTop: theme.spacing[8] },
  destructive: { color: colors.danger.foreground, backgroundColor: colors.danger.base },
  error: { color: colors.danger.base, textAlign: "center" },
  button: { minHeight: 56 },
});
