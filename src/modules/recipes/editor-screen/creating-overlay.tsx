import { StyleSheet, View } from "react-native";

import cuiskoCooking from "assets/videos/cuisko-cooking";
import { LoadingScreen } from "@ui/loading-screen";
import { useTranslations } from "translations";

/**
 * The jokes that roll by while the agent works, in order. Eight of them over a {@link PASS_MS}
 * pass, so a wait of the length this usually takes is over before the loop comes round.
 */
const STEPS = [
  "Creating.step_glasses",
  "Creating.step_handwriting",
  "Creating.step_onions",
  "Creating.step_salt",
  "Creating.step_grandma",
  "Creating.step_tidy",
  "Creating.step_flour",
  "Creating.step_plating",
] as const;

/** One pass through the jokes, pitched at what the sanitize agent usually costs. */
const PASS_MS = 50_000;

/**
 * What the cook watches while their recipe is being read.
 *
 * It covers the editor rather than replacing it, which is the whole reason there is no `creating`
 * route: a failure lifts the overlay and the typed text is still underneath, untouched. A route
 * would have unmounted the form to show the same wait.
 *
 * The agent reports nothing while it runs, so nothing here pretends to measure it: the steps are
 * theatre, and the loading screen's bar never claims a finish it has not been told about.
 */
export const CreatingOverlay = () => {
  const t = useTranslations("Recipe");

  return (
    <View style={styles.overlay}>
      <LoadingScreen
        animation={cuiskoCooking}
        steps={STEPS.map((key) => t(key))}
        durationMs={PASS_MS}
        footer={t("Creating.reassurance")}
        fadeInOut
      />
    </View>
  );
};

const styles = StyleSheet.create({
  /**
   * Over everything the editor draws, including the floating actions — the save it is reporting on
   * has already happened, so a second press must not be reachable.
   */
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
});
