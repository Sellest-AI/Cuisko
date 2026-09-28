import LottieView, { type LottieViewProps } from "lottie-react-native";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { m } from "@ui/motion";
import { SafeAreaView } from "@ui/safe-area-view";
import { StepProgress } from "@ui/step-progress";
import { Text } from "@ui/text";
import { curvedStepDuration } from "@ui/utils";
import { colors, theme } from "theme";

import { LoadingSteps } from "./loading-screen.steps";
import { LinearGradient } from "expo-linear-gradient";

type Props = {
  /** A `.lottie` or `.json` animation, imported by the caller: `import cooking from "assets/animations/cooking.lottie"`. */
  animation: number | string | LottieViewProps["source"];
  /** Cosmetic steps, shown in order and looped for as long as the screen stays up. Six or more reads
   * best: fewer, and the loop comes round often enough to be noticed as a loop. */
  steps: readonly string[];
  /** How long one pass through every step takes, in ms. */
  durationMs: number;
  /** The reassurance line at the bottom. */
  footer: string;

  showBackground?: boolean;
  /**
   * The screen's own progress bar. Off where the screen is drawn inside a flow that already shows
   * one above it, and two bars would count two different things on one page.
   */
  showProgress?: boolean;
  /**
   * Fade in on mount, and out on unmount. The fade out only runs when the caller mounts the screen
   * inside `AnimatePresence`, which is what keeps a removed child alive long enough to animate.
   */
  fadeInOut?: boolean;
  /**
   * The work is done. The bar runs to full and the steps stop advancing, so the wait is seen
   * finishing rather than cut off mid-loop.
   *
   * The bar takes about 800ms to travel (`StepProgress` owns that duration), so a caller that
   * unmounts the screen the instant it sets this shows the start of that travel and no more.
   * Holding the screen for a beat first is what makes the difference visible.
   */
  finished?: boolean;
};

const FADE = {
  from: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { type: "timing", duration: 300 },
} as const;

/** The box the animation is fitted into; a wider or taller animation letterboxes inside it. */
const ANIMATION_WIDTH = "100%";
const ANIMATION_HEIGHT = 260;

/** A DOM style, not a React Native one: it lands on the dotLottie canvas wrapper. */
const WEB_FILL = { width: "100%", height: "100%" };

/**
 * A full-screen wait for work whose real progress the app cannot see.
 *
 * The steps are theatre: they loop until the caller unmounts the screen. The bar stops one step
 * short of full for the same reason, since a full bar would claim a finish nobody has reported.
 */
export const LoadingScreen = ({
  animation,
  steps,
  durationMs,
  footer,
  showBackground = true,
  showProgress = true,
  fadeInOut = false,
  finished = false,
}: Props) => {
  /** Counts up forever rather than wrapping, so the list can key its rows by it and roll seamlessly. */
  const [active, setActive] = useState(0);
  const count = steps.length;

  useEffect(() => {
    if (count === 0 || finished) return;

    const timer = setTimeout(
      () => setActive((current) => current + 1),
      curvedStepDuration(active % count, count, durationMs),
    );

    return () => clearTimeout(timer);
  }, [active, count, durationMs, finished]);

  return (
    <m.View
      style={[styles.root, showBackground && { backgroundColor: colors.background }]}
      {...(fadeInOut ? FADE : {})}
    >
      {showBackground && <LinearGradient
        style={[StyleSheet.absoluteFill, { opacity: 0.3 }]}
        colors={[colors.primary.subtle, colors.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />}
      <SafeAreaView style={styles.safe} edges={{ top: "additive", bottom: "additive" }}>
        {/*
          * `active` is 0-based and `step` is 1-based, so `active + 1` is "steps gone by" — the bar
          * reads as the step list's own tally rather than racing it. `linear` because
          * `curvedStepDuration` already bends the clock these steps advance on.
          */}
        {showProgress && (
          <StepProgress
            step={finished ? count : Math.min(active + 1, count - 1)}
            total={count}
            curve="linear"
            style={styles.progress}
          />
        )}
        <View style={styles.body}>
          {/*
            * The box sets the size, not the player. On web lottie-react-native ignores `style` and
            * reads only `webStyle`, so a size set on the player alone grows it to its container
            * there. Filling a sized parent holds on every platform; `contain` keeps the ratio.
            */}
          <View style={styles.animation}>
            <LottieView
              // A bundled asset is a numeric registry id under Metro, which lottie-react-native
              // loads but its `source` type does not list.
              source={animation as LottieViewProps["source"]}
              autoPlay
              loop
              resizeMode="contain"
              style={styles.fill}
              webStyle={WEB_FILL}
            />
          </View>
          <LoadingSteps steps={steps} active={active} finished={finished} />
        </View>
        <Text.Base color={colors.muted} style={{ ...styles.footer, textBalance: true }}>
          {footer}
        </Text.Base>
      </SafeAreaView>
    </m.View>
  );
};

const styles = StyleSheet.create({
  /** Painted, not bare: the gradient fades to this, so it has to be the ground and not a hole. */
  root: { flex: 1 },
  safe: {
    flex: 1,
    paddingBottom: theme.spacing[32],
    paddingTop: theme.spacing[16],
  },
  progress: {
    marginHorizontal: "auto",
    marginTop: theme.spacing[16],
    width: 320,
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 64,
  },
  animation: { width: ANIMATION_WIDTH, height: ANIMATION_HEIGHT, overflow: "hidden" },
  fill: { width: "100%", height: "100%" },
  footer: {
    textAlign: "center",
    alignSelf: "center",
    marginHorizontal: theme.spacing[16],
    paddingBottom: theme.spacing[24],
    maxWidth: 280,
  },
});
