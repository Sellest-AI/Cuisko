import { StyleSheet, View } from "react-native";

import { BlurView } from "@ui/blur-view";
import { ProgressRing } from "@ui/progress-ring";
import { Text } from "@ui/text";
import { colors, theme } from "theme";
import { useTranslations } from "translations";

import { CreatingPhase } from "~/modules/recipes/hooks";

type Props = {
  /** 0 → 1, straight from the hook. The overlay counts nothing itself. */
  progress: number;
  phase: CreatingPhase;
};

/**
 * What the cook watches while their recipe is being read.
 *
 * It covers the editor rather than replacing it, which is the whole reason there is no `creating`
 * route: a failure lifts the overlay and the typed text is still underneath, untouched. A route
 * would have unmounted the form to show the same ring.
 *
 * The percentage is deliberately absent. It is an estimate, and printing it to the digit invites
 * the one question the estimate cannot answer — how long is left. The ring shows motion, the label
 * says what is happening, and neither of them claims to know.
 */
export const CreatingOverlay = ({ progress, phase }: Props) => {
  const t = useTranslations("Recipe");

  return (
    <View style={styles.overlay}>
      <BlurView style={styles.scrim}>
        <ProgressRing progress={progress}>
          <Text.Lg color={colors.neutral.foreground} style={styles.phase}>
            {t(`Creating.${phase}`)}
          </Text.Lg>
        </ProgressRing>
        <Text.Base color={colors.neutral.elevated} style={styles.reassurance}>
          {t("Creating.reassurance")}
        </Text.Base>
      </BlurView>
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
  /**
   * No `backgroundColor`: the dark tint is the scrim. A fill here would be repainted behind the
   * blur as an opaque layer, and the editor would vanish instead of going soft behind it.
   */
  scrim: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[24],
    paddingHorizontal: theme.spacing[32],
  },
  phase: { textAlign: "center" },
  reassurance: { textAlign: "center", opacity: 0.7 },
});
