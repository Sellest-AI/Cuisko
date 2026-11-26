import { ActivityIndicator, Platform, StyleSheet, View, type LayoutChangeEvent } from "react-native";

import { AppleLogo, CircleAlert, GoogleLogo } from "@ui/icons";
import { InfoBanner } from "@ui/info-banner";
import { Pressable } from "@ui/pressable";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";
import { WEBSITE } from "~/global/website";
import { openInBrowser } from "~/lib/openInBrowser";

import { useAuth } from "../_hooks/useAuth";
import { DevSignIn } from "./dev-sign-in";
import { Hero } from "./hero";
import { ProviderButton } from "./provider-button";

/** Long enough that no one reaches it by accident; the review notes tell the reviewer to hold it. */
const REVIEW_PRESS_MS = 3000;

type Props = {
  /** The sheet is cut to this column's height (`useMeasuredModalSheet`). */
  onLayout: (event: LayoutChangeEvent) => void;
};

/**
 * The sign-in sheet: the produce banner, what Cuisko is, and one tap to continue. Opened over the page that asked for
 * it — home, a recipe, the onboarding's first step — which stays in sight behind it; closing the
 * sheet returns there.
 *
 * There is no sign-in / sign-up choice. An OAuth provider creates the account on first use, and
 * the backend runs the same path for a new and a returning user — asking someone to classify
 * themselves first would be a question nothing downstream needs answered.
 *
 * Apple leads on iOS, where the App Store requires it beside Google (guideline 4.8), and is absent
 * elsewhere: Android users have Google, and a second web sign-in there would only add a choice.
 */
export const AuthScreen = ({ onLayout }: Props) => {
  const t = useTranslations("Auth");

  const {
    isLoading,
    isSubmitting,
    pendingProvider,
    error,
    signIn,
    signInWithProvider,
    isReviewAvailable,
    signInAsReviewer,
  } = useAuth();

  return (
    <View onLayout={onLayout} style={styles.container}>
      {/* From the sheet's top, under its close button: the photo is the sheet's own header. */}
      <Hero />
      <View style={styles.body}>
        <View style={styles.copy}>
          {/* The way in for a store reviewer: inert unless the backend says this build is in review. */}
          <Pressable
            // Not `disabled`, which a screen reader announces as a dimmed button on the welcome
            // heading for every user. The check lives in the handler instead, and `accessible`
            // keeps the heading plain text unless there is something to press.
            accessible={isReviewAvailable}
            animated={false}
            delayLongPress={REVIEW_PRESS_MS}
            onLongPress={() => {
              if (isReviewAvailable && !isSubmitting) void signInAsReviewer();
            }}
          >
            <Text.H4 color={theme.colors.foreground}>{t("welcome")}</Text.H4>
          </Pressable>
          <Text.Base color={theme.colors.muted} style={{ ...styles.tagline, textBalance: true }}>
            {t("tagline")}
          </Text.Base>
        </View>

        {/*
          * A sign-in that went through, its cook's row still arriving: the gate closes the sheet once
          * it lands. The spinner takes the buttons' place, so the sheet keeps its height.
          */}
        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.colors.primary.base} />
          </View>
        ) : (
          <View style={styles.actions}>
            {Platform.OS === "ios" ? (
              <>
                <ProviderButton
                  label={t("continue_with_apple")}
                  logo={AppleLogo}
                  isLoading={pendingProvider === "apple"}
                  disabled={isSubmitting}
                  onPress={() => void signInWithProvider("apple")}
                />

                <View style={styles.divider}>
                  <View style={styles.rule} />
                  <Text.Base color={theme.colors.muted}>{t("or")}</Text.Base>
                  <View style={styles.rule} />
                </View>
              </>
            ) : null}

            <ProviderButton
              variant="secondary"
              label={t("continue_with_google")}
              logo={GoogleLogo}
              isLoading={pendingProvider === "google"}
              disabled={isSubmitting}
              onPress={() => void signInWithProvider("google")}
            />

            {error ? (
              <InfoBanner variant="warning" icon={CircleAlert} title={t("error_title")}>
                {error}
              </InfoBanner>
            ) : null}

            {__DEV__ ? <DevSignIn isSubmitting={isSubmitting} onSubmit={(c) => void signIn(c)} /> : null}

            {/* Signing in is what creates the account, so the texts it agrees to sit under the buttons. */}
            <Text.Sm color={theme.colors.muted} style={styles.legal}>
              {t("Legal.before_terms")}
              <Text.Sm color={theme.colors.foreground} style={styles.link} onPress={() => openInBrowser(WEBSITE.TERMS_OF_USE)}>
                {t("Legal.terms")}
              </Text.Sm>
              {t("Legal.between")}
              <Text.Sm color={theme.colors.foreground} style={styles.link} onPress={() => openInBrowser(WEBSITE.PRIVACY_POLICY)}>
                {t("Legal.privacy")}
              </Text.Sm>
              {t("Legal.after_privacy")}
            </Text.Sm>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  /** Auto-height: `useMeasuredModalSheet` measures this column, so it must not be `flex: 1`. */
  container: {
    gap: theme.spacing[28],
    paddingBottom: Platform.select({ android: theme.spacing[28], default: theme.spacing[8] }),
  },
  body: { gap: theme.spacing[32], paddingHorizontal: theme.spacing[32] },
  copy: { alignItems: "center", gap: theme.spacing[16] },
  tagline: { textAlign: "center" },
  loading: { alignItems: "center", justifyContent: "center", minHeight: 160 },
  actions: { alignSelf: "center", gap: theme.spacing[16], maxWidth: 320, width: "100%" },
  divider: { alignItems: "center", flexDirection: "row", gap: theme.spacing[16] },
  rule: { backgroundColor: theme.colors.neutral.subtle, flex: 1, height: StyleSheet.hairlineWidth },
  legal: {
    // Android has no Apple button, so the legal line takes up the space it would have filled.
    marginTop: Platform.select({ android: theme.spacing[12], default: theme.spacing[4] }),
    textAlign: "center",
    maxWidth: 232,
    alignSelf: "center"
  },
  link: { textDecorationLine: "underline" },
});
