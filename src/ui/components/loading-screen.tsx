import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Image } from "@ui/image";
import { m } from "@ui/motion";
import { SafeAreaView } from "@ui/safe-area-view";
import { StepProgress } from "@ui/step-progress";
import { Text } from "@ui/text";
import { curvedStepDuration } from "@ui/utils";
import { colors, theme } from "theme";

import { LoadingSteps } from "./loading-screen.steps";
import { LinearGradient } from "expo-linear-gradient";

type Props = {
  /**
   * A looping animated WebP and its aspect ratio, as `scripts/videos/bundle-frames.ts` generates
   * them, imported by the caller: `import cuiskoCooking from "assets/videos/cuisko-cooking"`.
   * A source is `number | string` for the reason assets/images.d.ts gives.
   */
  animation: { source: number | string; aspectRatio: number };
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
      <SafeAreaView style={styles.safe} edges={{ top: "additive", bottom: "android" }}>
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
          {/* The platform decoder plays and loops it; expo-image autoplays an animated image. */}
          <Image
            source={animation.source}
            contentFit="contain"
            style={[styles.animation, { aspectRatio: animation.aspectRatio }]}
          />
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
    paddingTop: theme.spacing[12],
    paddingBottom: theme.spacing[16],
    marginHorizontal: "auto",
    width: 160,
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    gap: 16,
  },
  /** Full width; the height follows from the animation's own aspect ratio. */
  animation: { width: "100%" },
  footer: {
    textAlign: "center",
    alignSelf: "center",
    marginHorizontal: theme.spacing[16],
    marginTop: theme.spacing[32],
    paddingBottom: theme.spacing[24],
    maxWidth: 280,
  },
});
