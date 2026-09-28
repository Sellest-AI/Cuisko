import { StyleSheet, View } from "react-native";

import { Image } from "@ui/image";
import { m } from "@ui/motion";
import { Text } from "@ui/text";
import { colors, theme } from "theme";
import { useTranslations } from "translations";

import { CUISKO } from "~/lib/mascots";

import { useProgressClearance } from "./_hooks/useProgressClearance";
import { SCREENSHOT_ASPECT_RATIO, SCREENSHOTS, type Showcase } from "./screenshots";

/** The phone's share of the width: wide enough to read the screenshot, narrow enough to be a phone. */
const PHONE_WIDTH = "85%";
/** The frosted rim around the screenshot, as the app's cards have around their photos. */
const RIM = theme.spacing[6];
const PHONE_RADIUS = 32;

/**
 * The page that opens each section: which part of the app the next few screens are about, and a
 * phone showing that page of the real app, rising from under the pill.
 *
 * It asks for nothing. On an intro its Continue is worded for the section ("Start tracking"), which
 * the chrome reads from the same section, so the button says what the next screens are about to do.
 * The import uses it too, as a page of its own inside the recipes section: shown, not practised.
 *
 * In the app's own materials: the tunnel's orange title over the soft wash, and the screenshot in a
 * frosted frame with the translucent rim and soft shadow the app's cards wear.
 */
export const OnboardingSectionIntro = ({ page }: { page: Showcase }) => {
  const t = useTranslations("Onboarding");
  const screenshot = SCREENSHOTS[page];
  const clearance = useProgressClearance();

  return (
    <View style={[styles.page, { paddingTop: clearance }]}>
      <Text.H4 color={colors.foreground} style={{ ...styles.title, textBalance: true }}>
        {t(`Intros.${page}.title`)}
      </Text.H4>
      <Text.Lg color={colors.muted} style={{ ...styles.subtitle, textBalance: true }}>
        {t(`Intros.${page}.subtitle`)}
      </Text.Lg>
      <m.View
        from={{ translateY: 24, opacity: 0 }}
        animate={{ translateY: 0, opacity: 1 }}
        transition={{ type: "timing", duration: 420, delay: 150 }}
        style={styles.phone}
      >
        <View style={styles.screen}>
          {screenshot ? (
            <Image source={screenshot} contentFit="cover" contentPosition="top" style={styles.fill} />
          ) : (
            <View style={[styles.fill, styles.placeholder]}>
              <Image source={CUISKO.idle} contentFit="contain" style={styles.mascot} />
            </View>
          )}
        </View>
      </m.View>
    </View>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: "center", overflow: "hidden" },
  title: { textAlign: "center", maxWidth: 260, marginTop: theme.spacing[16] },
  subtitle: {
    textAlign: "center",
    marginTop: theme.spacing[8],
    maxWidth: 300,
    paddingHorizontal: theme.spacing[16],
  },
  /**
   * As tall as its screenshot makes it, so it runs on under the pill and off the page, which cuts it:
   * a phone held up to the camera rather than framed, and its screen never stretched to fit.
   */
  phone: {
    width: PHONE_WIDTH,
    marginTop: theme.spacing[28],
    padding: RIM,
    borderRadius: PHONE_RADIUS,
    backgroundColor: colors.surface.elevated,
    borderWidth: 0,
    borderColor: colors.border.default,
    boxShadow: [{ offsetX: 0, offsetY: 20, blurRadius: 32, spreadDistance: 20, color: "rgba(0, 0, 0, 0.04)" }],
  },
  screen: {
    width: "100%",
    aspectRatio: SCREENSHOT_ASPECT_RATIO,
    borderRadius: PHONE_RADIUS - RIM,
    overflow: "hidden",
    backgroundColor: colors.background,
  },
  fill: { width: "100%", height: "100%" },
  placeholder: { alignItems: "center", justifyContent: "center", backgroundColor: colors.neutral.subtle },
  mascot: { width: 140, height: 140 },
});
