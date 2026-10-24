import { LinearGradient } from "expo-linear-gradient";
import { DefaultTheme, ThemeProvider } from "expo-router";
import { ReactNode, useEffect } from "react";
import { BackHandler, Platform, StyleSheet, View } from "react-native";

import { ArrowRight } from "@ui/icons";
import { AnimatePresence } from "@ui/motion";
import { StepBar } from "@ui/step-bar";
import { StepProgress } from "@ui/step-progress";
import { useSafeAreaInsets } from "@ui/safe-area-view";
import { colors } from "theme";
import { useTranslations } from "translations";

import { NAVIGATION_BAR_HEIGHT } from "~/modules/navigation/constants";

import { PawLayer } from "./_components/paw-layer";
import { useOnboarding } from "./_hooks/useOnboarding";
import { PROGRESS_MARGIN, useProgressClearance } from "./_hooks/useProgressClearance";

/** The planning tunnel's width for the same bar, so the two flows measure alike. */
const PROGRESS_WIDTH = 320;
/** How strongly the orange wash tints the paper, here and in the band that fades over the page. */
const GROUND_OPACITY = 0.3;

/**
 * The navigator, retinted so the ground shows through it. The planning tunnel's chrome says why
 * the theme, and not a screen option, is the only lever that reaches it.
 */
const ONBOARDING_THEME = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: "transparent" },
};

/**
 * The frame every onboarding step is drawn inside, in the planning tunnel's own clothes: the soft
 * orange wash at the top, the same progress (floating over the page, which starts below it with
 * `useProgressClearance`), and the same pill at the foot. The onboarding is a
 * first taste of the app, so it wears the app's look rather than one of its own.
 *
 * Continue stays away until the step allows it (`canContinue`), then rises into place: the pill
 * arriving is itself the sign that the action worked. It used to wait dimmed instead, and people
 * kept tapping it, so a step now shows only what can be done on it. On a section's intro it is
 * worded for the section ("Start tracking"). This also leaves the foot to a step that brings its
 * own way on (the cooking session, the week's loader) until its action is done.
 *
 * **Forward only.** There is no back button, no Skip, and the Android back button does nothing here
 * (the layout turns off the swipe on iOS): each screen builds on the one before, the gratin
 * planned on screen 5 is what screen 6 cooks, and walking back through them would undo nothing.
 *
 * Here rather than in the route file so `app/` stays routing-only (ADR 0006), and here rather than
 * in each step so the controls cannot drift between them.
 */
export const OnboardingChrome = ({ children }: { children: ReactNode }) => {
  const t = useTranslations("Onboarding");
  const { step, intro, position, progress, progressTotal, total, isLast, canContinue, next } = useOnboarding();
  const { top, bottom } = useSafeAreaInsets();
  const clearance = useProgressClearance();

  /** `true` tells Android the press was handled, so it neither pops the step nor leaves the app. */
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);

    return () => subscription.remove();
  }, []);

  const label = intro ? t(`Intros.${intro}.cta`) : isLast ? t("meet_cuisko") : t("continue");
  /** The cooking session is the app's `StepByStepView`, whose own bar already clears the Android buttons. */
  const isCookingSession = step === "cook";

  return (
    <View style={styles.root}>
      {/* Around everything, so its paws are drawn last: above the page, the progress and the pill. */}
      <PawLayer>
        <LinearGradient
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.ground]}
          colors={[colors.primary.subtle, colors.primary.subtle, colors.primary.subtle, colors.background]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 0.7 }}
        />
        <View style={[styles.flex, {
          paddingBottom: Platform.select({
            android: isCookingSession ? 0 : bottom,
            default: 0
          })
        }]}>
          <ThemeProvider value={ONBOARDING_THEME}>{children}</ThemeProvider>
        </View>
        {/*
          Floats over the page instead of taking a band of it, so a page scrolls up under it and the
          cooking photo reaches the top edge. The band fades out to nothing: at the top it is the
          ground itself (the paper, then the wash at the ground's own strength), so a page passing
          under it melts away rather than being cut by a line.
        */}
        <View pointerEvents="none" style={[styles.band, { height: clearance + PROGRESS_MARGIN, paddingTop: top + PROGRESS_MARGIN }]}>
          <LinearGradient
            style={[StyleSheet.absoluteFill, styles.bandWash]}
            colors={[colors.primary.subtle, colors.primary.subtle, `${colors.primary.subtle}00`]}
            locations={[0, 0.55, 1]}
          />
          <StepProgress
            step={progress}
            total={progressTotal}
            trackColor={colors.surface.elevated}
            style={styles.progress}
          />
        </View>
        <AnimatePresence>
          {canContinue && (
            <StepBar
              travel={NAVIGATION_BAR_HEIGHT}
              step={position}
              total={total}
              showProgress={false}
              label={label}
              variant="primary"
              nextIcon={ArrowRight}
              style={{ alignItems: "stretch" }}
              onNext={next}
            />
          )}
        </AnimatePresence>
      </PawLayer>
    </View>
  );
};

const styles = StyleSheet.create({
  /** Painted, not bare: the gradient fades to *this*, so it has to be the ground and not a hole. */
  root: { flex: 1, backgroundColor: colors.background },
  ground: { height: "62%", opacity: GROUND_OPACITY },
  band: { position: "absolute", top: 0, left: 0, right: 0 },
  bandWash: { opacity: GROUND_OPACITY },
  progress: { marginHorizontal: "auto", width: PROGRESS_WIDTH },
  flex: { flex: 1 },
});
