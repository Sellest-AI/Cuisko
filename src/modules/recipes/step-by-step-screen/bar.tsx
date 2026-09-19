import { useEffect, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View, ViewStyle } from "react-native";

import { ButtonIcon } from "@ui/button-icon";
import { ButtonPill } from "@ui/button-pill";
import { DatabaseX, SkipBack, SkipForward } from "@ui/icons";
import { InfoBanner } from "@ui/info-banner";
import { SafeAreaView } from "@ui/safe-area-view";
import { m } from "@ui/motion";
import { theme } from "theme";
import { useTranslations } from "translations";

import { NAVIGATION_BAR_HEIGHT } from "~/modules/navigation/constants";

type Props = {
  /** Nothing came before this step, so there is nowhere to go back to. */
  isFirst: boolean;
  /** The last step, where the move stops being navigation and becomes the thing cooking was for. */
  isLast: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onFinish: () => void;
  /** The finish is in flight: the button waits, so a second tap cannot spend the cellar twice. */
  isFinishing?: boolean;
  /** The finish was refused, and the cook is still here to be told so. */
  finishFailed?: boolean;
  /**
   * How tall the bar ended up. It floats over the page rather than sitting in it, so the page has
   * to be told how much of itself to keep clear — and that height changes on the last step.
   */
  onHeight?: (height: number) => void;
};

/** How far above the bar the content has dissolved by, in points. */
const FADE_HEIGHT = 40;

/**
 * How long the cellar button stays inert, in seconds. Finishing spends real ingredients out of the
 * cook's stock, and the last step is the one place the Next button has been under a moving thumb —
 * so the control that consumes the cellar refuses to be the one that thumb lands on.
 */
const FINISH_DELAY_SECONDS = 3;

type UpdateCellarButtonProps = { onPress: () => void; style: ViewStyle; isLoading: boolean };

const UpdateCellarButton = ({ onPress, style, isLoading }: UpdateCellarButtonProps) => {
  const t = useTranslations("Recipe");
  const [timer, setTimer] = useState(FINISH_DELAY_SECONDS);

  /**
   * Stopping is the effect's job, not the updater's: a state updater must be pure, and React runs
   * it twice under StrictMode — so clearing the interval inside it fired the teardown on a render
   * that had not committed. Re-running on each tick lets the guard below end the countdown at zero
   * rather than one past it.
   */
  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => setTimer((current) => Math.max(0, current - 1)), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  const disabled = timer > 0;
  const updateCellarText = disabled ?
    t("Cooking.update_cellar_pending", { seconds: timer }) : t("Cooking.update_cellar");

  return (
    <ButtonPill
      size="lg"
      elevated
      variant="secondary"
      leftIcon={DatabaseX}
      onPress={onPress}
      style={style}
      disabled={disabled}
      isLoading={isLoading}
    >
      {updateCellarText}
    </ButtonPill>
  )
}

/**
 * The bar the cook moves the method on with — and, at the end, closes the loop with.
 *
 * Two shapes rather than a disabled Next: on the last step there is no step after this one to
 * offer, and the one thing left to do is tell the app what the cooking consumed. A "Next" that
 * quietly did that would be the app spending someone's ingredients behind a navigation word.
 */
export const StepBar = ({ isFirst, isLast, onPrevious, onNext, onFinish, isFinishing = false, finishFailed = false, onHeight }: Props) => {
  const t = useTranslations("Recipe");

  return (
    <m.View
      style={styles.container}
      onLayout={(event) => onHeight?.(event.nativeEvent.layout.height)}
      from={{ opacity: 0, translateY: NAVIGATION_BAR_HEIGHT }}
      animate={{ opacity: 1, translateY: 0 }}
      exit={{ opacity: 0, translateY: NAVIGATION_BAR_HEIGHT }}
      transition={{ type: "timing", duration: 300, delay: 300 }}
    >
      <LinearGradient
        pointerEvents="none"
        colors={["transparent", "rgba(0, 0, 0, 0.1)"]}
        style={styles.fade}
      />
      <SafeAreaView
        edges={{ bottom: "android", top: "off" }}
      >
        {isLast ? (
          <>
            {/*
              * The same banner, turned: the failure is about the thing the banner was promising,
              * and it is where the cook is already looking. The button stays live underneath so
              * the answer to a refused write is a second tap, not a lost dinner.
              */}
            {finishFailed ? (
              <InfoBanner variant="warning" title={t("Cooking.cellar_failed_title")} icon={DatabaseX} style={styles.banner}>
                {t("Cooking.cellar_failed_body")}
              </InfoBanner>
            ) : (
              <InfoBanner variant="secondary" title={t("Cooking.cellar_title")} icon={DatabaseX} style={styles.banner}>
                {t("Cooking.cellar_body")}
              </InfoBanner>
            )}
            <View style={styles.controls}>
              <ButtonIcon
                elevated
                onPress={onPrevious}
                variant="neutral-subtle"
                style={styles.finish}
                disabled={isFirst}
                size="lg"
              >
                {SkipBack}
              </ButtonIcon>
              <UpdateCellarButton
                style={styles.finish}
                onPress={onFinish}
                isLoading={isFinishing}
              />
            </View>
          </>
        ) : (
          <View style={styles.controls}>
            {/*
          * Present but inert on the first step rather than absent: the pair is how the bar reads
          * as a transport, and a Next that slid across the bar on step two would say the control
          * had changed rather than that a step had.
          */}
            <ButtonPill
              variant="neutral"
              size="lg"
              rightIcon={SkipBack}
              onPress={onPrevious}
              disabled={isFirst}
              elevated
            >
              {t("Cooking.previous")}
            </ButtonPill>
            <ButtonPill
              elevated
              variant="secondary"
              size="lg"
              leftIcon={SkipForward}
              onPress={onNext}
            >
              {t("Cooking.next")}
            </ButtonPill>
          </View>
        )}
      </SafeAreaView>
    </m.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    gap: theme.spacing[12],
    paddingHorizontal: theme.spacing[16],
    paddingBottom: theme.spacing[24],
  },
  /** Reaches above the bar so the step's content dissolves into it instead of ending under it. */
  fade: {
    position: "absolute",
    top: -FADE_HEIGHT,
    left: 0,
    right: 0,
    bottom: 0,
  },
  banner: {
    marginBottom: theme.spacing[16]
  },
  controls: {
    height: NAVIGATION_BAR_HEIGHT - theme.spacing[24],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[16],
  },
  finish: { alignSelf: "center" },
});
