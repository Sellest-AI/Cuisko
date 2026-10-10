import { Linking, StyleSheet, View } from "react-native";

import { ButtonPill } from "@ui/button-pill";
import { FileText, Lock, Mail } from "@ui/icons";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";
import { WEBSITE } from "~/global/website";
import { openInBrowser } from "~/lib/openInBrowser";

/** A phone with no mail app refuses the `mailto:`; the contact page shows the address instead. */
const contactSupport = () => {
  Linking.openURL(`mailto:${WEBSITE.SUPPORT_EMAIL}`).catch(() => openInBrowser(WEBSITE.CONTACT));
};

/**
 * Who to write to, and the texts the cook agreed to. The stores require both to be one tap from the
 * account, so they sit in the drawer rather than behind a settings page.
 */
export const AccountHelp = () => {
  const t = useTranslations("Account");

  return (
    <View style={styles.section}>
      <Text.Lg>{t("Help.title")}</Text.Lg>
      <ButtonPill variant="neutral" size="md" leftIcon={Mail} onPress={contactSupport}>
        {t("Help.contact")}
      </ButtonPill>
      <ButtonPill variant="neutral" size="md" leftIcon={FileText} onPress={() => openInBrowser(WEBSITE.TERMS_OF_USE)}>
        {t("Help.terms")}
      </ButtonPill>
      <ButtonPill variant="neutral" size="md" leftIcon={Lock} onPress={() => openInBrowser(WEBSITE.PRIVACY_POLICY)}>
        {t("Help.privacy")}
      </ButtonPill>
    </View>
  );
};

const styles = StyleSheet.create({
  section: { gap: theme.spacing[12] },
});
