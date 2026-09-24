import { ActivityIndicator, StyleSheet, View } from "react-native";

import { AppleLogo, CircleAlert, GoogleLogo } from "@ui/icons";
import { InfoBanner } from "@ui/info-banner";
import { useSafeAreaInsets } from "@ui/safe-area-view";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

import { useAuth } from "../_hooks/useAuth";
import { DevSignIn } from "./dev-sign-in";
import { Hero } from "./hero";
import { ProviderButton } from "./provider-button";

/**
 * The welcome screen: what Cuisko is, and one tap to continue.
 *
 * There is no sign-in / sign-up choice. An OAuth provider creates the account on first use, and
 * the backend runs the same path for a new and a returning user — asking someone to classify
 * themselves first would be a question nothing downstream needs answered.
 *
 * Apple is shown disabled: the provider is not built yet, and the mockup keeps its place.
 */
export const AuthScreen = () => {
  const t = useTranslations("Auth");
  const insets = useSafeAreaInsets();
  const { isLoading, isSubmitting, pendingProvider, error, signIn, signInWithProvider } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.colors.primary.base} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Hero />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + theme.spacing[32] }]}>
        <View style={styles.copy}>
          <Text.H4 color={theme.colors.foreground}>{t("welcome")}</Text.H4>
          <Text.Base color={theme.colors.muted} style={{ ...styles.tagline, textBalance: true }}>
            {t("tagline")}
          </Text.Base>
        </View>

        <View style={styles.actions}>
          <ProviderButton
            variant="secondary"
            label={t("continue_with_google")}
            logo={GoogleLogo}
            isLoading={pendingProvider === "google"}
            disabled={isSubmitting}
            onPress={() => void signInWithProvider("google")}
          />

          <View style={styles.divider}>
            <View style={styles.rule} />
            <Text.Base color={theme.colors.muted}>{t("or")}</Text.Base>
            <View style={styles.rule} />
          </View>

          <ProviderButton
            label={t("continue_with_apple")}
            logo={AppleLogo}
            disabled
            onPress={() => void signInWithProvider("apple")}
          />

          {error ? (
            <InfoBanner variant="warning" icon={CircleAlert} title={t("error_title")}>
              {error}
            </InfoBanner>
          ) : null}

          {__DEV__ ? <DevSignIn isSubmitting={isSubmitting} onSubmit={(c) => void signIn(c)} /> : null}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  loading: {
    alignItems: "center",
    backgroundColor: theme.colors.background,
    flex: 1,
    justifyContent: "center",
  },
  container: { backgroundColor: theme.colors.background, flex: 1 },
  sheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    gap: theme.spacing[32],
    marginTop: -theme.radius.lg,
    paddingHorizontal: theme.spacing[32],
    paddingTop: theme.spacing[32],
  },
  copy: { alignItems: "center", gap: theme.spacing[16] },
  tagline: { textAlign: "center" },
  actions: { alignSelf: "center", gap: theme.spacing[16], maxWidth: 320, width: "100%" },
  divider: { alignItems: "center", flexDirection: "row", gap: theme.spacing[16] },
  rule: { backgroundColor: theme.colors.neutral.subtle, flex: 1, height: StyleSheet.hairlineWidth },
});
