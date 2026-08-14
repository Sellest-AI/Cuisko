import { LinearGradient } from "expo-linear-gradient";
import { DefaultTheme, ThemeProvider } from "expo-router";
import { ReactNode, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedStyle } from "react-native-reanimated";

import { SafeAreaView } from "@ui/safe-area-view";
import { colors, theme } from "theme";
import { useTranslations } from "translations";

import { useTunnel, TUNNEL_STEPS } from "../_hooks/useTunnel";
import { tunnelScrollY } from "../_hooks/useTunnelScrollHandler";
import { useTunnelGroceries } from "../_hooks/useTunnelGroceries";
import { StepProgress } from "../_components/step-progress";
import { TunnelBar } from "../_components/tunnel-bar";
import { RadialGradient } from "@ui/radial-gradient";

/**
 * Per-step chrome, keyed by the step's own name.
 *
 * The questions run over an orange ground and the answers over cream: the first two steps ask the
 * user for something, the last two show what came back. `generating` wears neither bar, because
 * there is nothing to answer and nothing to go back to while it runs.
 */
const CHROME = {
  setup: { tinted: true, bar: true, progress: true },
  diet: { tinted: true, bar: true, progress: true },
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
  const { step, total, next, back } = useTunnel();
  const { newItemCount } = useTunnelGroceries();

  /** `useTunnel` clamps an unrecognised path to the first step, so this index is always in range. */
  const name = TUNNEL_STEPS[step - 1]!;
  const chrome = CHROME[name];

  const isLast = name === "groceries";
  const isReview = name === "review";

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
    <View style={styles.root}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, chrome.tinted && ground]}>
        <LinearGradient
          style={[StyleSheet.absoluteFill, { height: chrome.tinted ? "60%" : "100%" }]}
          colors={
            chrome.tinted
              ? [colors.primary.elevated, colors.primary.elevated, colors.primary.subtle, colors.background]
              : [colors.neutral.subtle, colors.background]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 0.7 }}
        />
      </Animated.View>
      {!chrome.tinted && !isLast && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, ground]}>
        <RadialGradient
          size={500}
          colors={[colors.primary.base, colors.neutral.subtle]}
          style={{ position: "absolute", top: 0, left: -172, opacity: 0.25 }}
        />
      </Animated.View>}
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
      {chrome.bar && (
        <TunnelBar
          step={step}
          total={total}
          label={isLast ? t("Tunnel.Groceries.save") : t("Tunnel.next_step")}
          sublabel={isLast ? t("Tunnel.Groceries.x_new_items", { count: newItemCount }) : undefined}
          variant={isLast ? "secondary" : "primary"}
          onNext={next}
          onBack={!isReview ? back : undefined}
        />
      )}
    </View>
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
});
