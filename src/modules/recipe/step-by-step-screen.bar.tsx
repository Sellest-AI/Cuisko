import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View, ViewStyle } from "react-native";

import { ButtonPill } from "@ui/button-pill";
import { DatabaseX, SkipBack, SkipForward } from "@ui/icons";
import { InfoBanner } from "@ui/info-banner";
import { m } from "@ui/motion";
import { theme } from "theme";
import { useTranslations } from "translations";

import { NAVIGATION_BAR_HEIGHT } from "~/modules/navigation/constants";
import { useEffect, useState } from "react";

type Props = {
  /** Nothing came before this step, so there is nowhere to go back to. */
  isFirst: boolean;
  /** The last step, where the move stops being navigation and becomes the thing cooking was for. */
  isLast: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onFinish: () => void;
  /**
   * How tall the bar ended up. It floats over the page rather than sitting in it, so the page has
   * to be told how much of itself to keep clear — and that height changes on the last step.
   */
  onHeight?: (height: number) => void;
};

/** How far above the bar the content has dissolved by, in points. */
const FADE_HEIGHT = 40;

const UpdateCellarButton = ({ onPress, style }: { onPress: () => void; style: ViewStyle }) => {
  const t = useTranslations("Recipe");
  const [timer, setTimer] = useState(3);
  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((current) => { if (current <= 0) { clearInterval(interval); } return current - 1; });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const disabled = timer > 0;
  const updateCellarText = disabled ?
    t("Cooking.update_cellar_pending", { seconds: timer }) : t("Cooking.update_cellar");

  return (
    <ButtonPill
      elevated
      variant="secondary"
      size="lg"
      leftIcon={DatabaseX}
      onPress={onPress}
      style={StyleSheet.flatten([style, disabled ? { opacity: 0.5 } : undefined])}
      disabled={disabled}
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
export const StepBar = ({ isFirst, isLast, onPrevious, onNext, onFinish, onHeight }: Props) => {
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
      {!isLast && <LinearGradient
        pointerEvents="none"
        colors={["transparent", "rgba(0, 0, 0, 0.1)"]}
        style={styles.fade}
      />}
      {isLast ? (
        <>
          <InfoBanner variant="secondary" title={t("Cooking.cellar_title")} icon={DatabaseX} style={styles.banner}>
            {t("Cooking.cellar_body")}
          </InfoBanner>
          <UpdateCellarButton
            style={styles.finish}
            onPress={onFinish}
          />
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
            style={isFirst ? styles.inert : undefined}
          >
            {t("Cooking.previous")}
          </ButtonPill>
          <ButtonPill elevated variant="secondary" size="lg" leftIcon={SkipForward} onPress={onNext}>
            {t("Cooking.next")}
          </ButtonPill>
        </View>
      )}
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
  inert: { opacity: 0.5 },
  finish: { alignSelf: "center" },
});
