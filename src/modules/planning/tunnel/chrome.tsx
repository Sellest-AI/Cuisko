import { LinearGradient } from "expo-linear-gradient";
import { DefaultTheme, ThemeProvider } from "expo-router";
import { ReactNode, useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedStyle } from "react-native-reanimated";

import { RadialGradient } from "@ui/radial-gradient";
import { AnimatePresence, m } from "@ui/motion";
import { DatabaseX } from "@ui/icons";
import { InfoBanner } from "@ui/info-banner";
import { SafeAreaView } from "@ui/safe-area-view";
import { colors, theme } from "theme";
import { useTranslations } from "translations";

import { NAVIGATION_BAR_HEIGHT } from "~/modules/navigation/constants";

import { usePlanCommit } from "../_hooks/usePlanCommit";
import { useTunnel, TUNNEL_STEPS } from "./_hooks/useTunnel";
import { tunnelScrollY } from "./_hooks/useTunnelScrollHandler";
import { useTunnelGroceries } from "./_hooks/useTunnelGroceries";
import { StepProgress } from "@ui/step-progress";
import { StepBar } from "@ui/step-bar";

/**
 * Per-step chrome, keyed by the step's own name.
 *
 * The questions run over an orange ground and the answers over cream: every step up to `utensils`
 * asks the user for something, the last two show what came back. `generating` wears neither bar,
 * because there is nothing to answer and nothing to go back to while it runs.
 */
const CHROME = {
  time: { tinted: true, bar: true, progress: true },
  week: { tinted: true, bar: true, progress: true },
  diet: { tinted: true, bar: true, progress: true },
  allergies: { tinted: true, bar: true, progress: true },
  mood: { tinted: true, bar: true, progress: true },
  focus: { tinted: true, bar: true, progress: true },
  utensils: { tinted: true, bar: true, progress: true },
  generating: { tinted: false, bar: false, progress: false },
  review: { tinted: false, bar: true, progress: true },
  groceries: { tinted: false, bar: true, progress: true },
} as const;

/** How far a step scrolls before its ground is gone entirely, in points. */
const FADE_DISTANCE = 300;

/**
 * The tunnel's navigator, retinted so the gradient shows through it.
 *
 * `contentStyle: transparent` on the Stack only clears the screen's own content view. Under it,
 * react-navigation hands `ScreenStack` a `nativeContainerBackgroundColor` read straight off the
 * navigation theme — no screen option reaches it — so the theme's default grey kept painting over
 * the gradient. Blanking `background` on a scoped theme is the only lever there is.
 */
const TUNNEL_THEME = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: "transparent" },
};

/**
 * The frame every tunnel step is drawn inside: the ground it sits on, the progress above it, and
 * the bar it moves on with.
 *
 * It lives here rather than in the route file so `app/` stays routing-only (ADR 0006), and here
 * rather than in each step so the bar cannot drift between them.
 */
export const TunnelChrome = ({ children }: { children: ReactNode }) => {
  const t = useTranslations("Planning");
  const { step, total, next, back, skipping, meals } = useTunnel();
  const { newItemCount } = useTunnelGroceries();
  const { commit, isSaving } = usePlanCommit();

  /**
   * The step whose keep last failed, and the fact of it. The banner is derived from being on that
   * step rather than cleared on leaving it — an effect resetting state is the cascading render the
   * lint rule names, and "you are back on the step whose write failed" is the honest thing to show.
   */
  const [saveFailed, setSaveFailed] = useState<{ step: number } | null>(null);

  /** `useTunnel` clamps an unrecognised path to the first step, so this index is always in range. */
  const name = TUNNEL_STEPS[step - 1]!;
  const chrome = CHROME[name];

  const isLast = name === "groceries";
  const isReview = name === "review";

  /**
   * The last step is the one that writes: the week and its missing ingredients are persisted, and
   * only then does the tunnel let go of them.
   *
   * A failed write leaves the user exactly where they were, with the draft intact, so the button is
   * theirs to press again — advancing would drop a week nothing had kept. It does not fail quietly:
   * the banner says so plainly (PRODUCT.md's rule for a failure with data at stake) and stays while
   * the user is on that step — backing out hides it, coming back shows it again. A press while the
   * first one is still in flight is ignored rather than queued, which is what stops a double tap
   * writing the week twice.
   */
  const keep = useCallback(async () => {
    if (isSaving) return;

    if (await commit()) {
      setSaveFailed(null);
      next();
    } else {
      setSaveFailed({ step });
    }
  }, [isSaving, commit, next, step]);

  /**
   * A generation that came back with nothing has nothing to keep, so the last step offers no way on.
   *
   * Dimmed rather than let through: the button would report a week saved and dismiss the tunnel
   * having written none, which is the one outcome worse than being stuck. Nothing here can recover a
   * failed generation — going back re-runs it — so this says so instead of pretending.
   */
  const hasNothingToKeep = isLast && meals.length === 0;

  /**
   * The ground fades out from under the first hundred points of scroll.
   *
   * The tint belongs to the question at the top of the step, so it goes when the question is
   * scrolled past — content reading over a full-strength orange halfway down the utensil grid is
   * the thing this replaces. Clamped, so an overscroll bounce cannot drive the opacity past 1.
   */
  const ground = useAnimatedStyle(() => ({
    opacity: interpolate(tunnelScrollY.value, [0, FADE_DISTANCE], [1, 0.2], Extrapolation.CLAMP),
  }));

  /**
   * Each step opens at the top of its own list, but the chrome outlives all of them and the offset
   * with it. Without this, walking on from a scrolled step would open the next one already faded.
   */
  useEffect(() => {
    tunnelScrollY.value = 0;
  }, [step]);

  return (
    <SafeAreaView style={styles.root} edges={{ top: "off", bottom: "android" }}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, chrome.tinted && ground]}>
        <LinearGradient
          style={[
            StyleSheet.absoluteFill,
            { height: chrome.tinted ? "62%" : "100%" },
            { opacity: chrome.tinted ? 0.8 : 1 }
          ]}
          colors={
            chrome.tinted
              ? [colors.primary.subtle, colors.primary.subtle, colors.primary.subtle, colors.background]
              : [colors.neutral.subtle, colors.background]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 0.7 }}
        />
      </Animated.View>
      <AnimatePresence>
        {!chrome.tinted && !isLast &&
          <m.View
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, ground]}>
              <RadialGradient
                size={500}
                colors={[colors.primary.base, colors.neutral.subtle]}
                style={{ position: "absolute", top: 0, left: -172, opacity: 0.25 }}
              />
            </Animated.View>
          </m.View>
        }
      </AnimatePresence>
      <SafeAreaView edges={{ top: "additive", bottom: "off" }} style={styles.safe}>
        {chrome.progress && (
          <StepProgress
            step={step}
            total={total}
            color={isLast ? colors.secondary.base : colors.primary.base}
            trackColor={chrome.tinted ? colors.surface.elevated : colors.primary.subtle}
            style={styles.progress}
          />
        )}
        <View style={styles.body}>
          <ThemeProvider value={TUNNEL_THEME}>{children}</ThemeProvider>
        </View>
      </SafeAreaView>
      {chrome.bar && saveFailed?.step === step && (
        <m.View
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          exit={{ opacity: 0 }}
          style={styles.banner}
        >
          <InfoBanner variant="warning" title={t("Tunnel.Groceries.save_failed_title")} icon={DatabaseX}>
            {t("Tunnel.Groceries.save_failed_body")}
          </InfoBanner>
        </m.View>
      )}
      {chrome.bar && (
        <StepBar
          travel={NAVIGATION_BAR_HEIGHT}
          step={step}
          total={total}
          showProgress={false}
          /**
           * An optional step with nothing picked says so, rather than looking like one the user has
           * failed to fill in. The label is the only affordance: a second button would make the bar
           * answerable to every step that wants its own control.
           */
          label={
            isLast
              ? t("Tunnel.Groceries.save")
              : skipping
                ? t("Tunnel.skip")
                : t("Tunnel.next_step")
          }
          sublabel={isLast ? t("Tunnel.Groceries.x_new_items", { count: newItemCount }) : undefined}
          variant={isLast ? "secondary" : "primary"}
          disabled={hasNothingToKeep}
          isLoading={isSaving}
          onNext={isLast ? keep : next}
          onBack={!isReview ? back : undefined}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  /** Painted, not bare: the gradient fades to *this*, so it has to be the ground and not a hole. */
  root: { flex: 1, backgroundColor: colors.background },
  safe: {
    flex: 1,
  },
  progress: {
    marginHorizontal: "auto",
    marginTop: theme.spacing[16],
    marginBottom: theme.spacing[8],
    width: 320
  },
  body: { flex: 1 },
  banner: {
    marginHorizontal: theme.spacing[16],
    marginBottom: theme.spacing[8],
  },
});
