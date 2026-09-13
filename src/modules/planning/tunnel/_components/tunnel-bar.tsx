import { StyleSheet, View, ViewStyle } from "react-native";

import { ButtonIcon } from "@ui/button-icon";
import { ButtonPill } from "@ui/button-pill";
import { ArrowLeft, ArrowRight, Icon, ListPlus, X } from "@ui/icons";
import { Text } from "@ui/text";
import { SafeAreaView } from "@ui/safe-area-view";
import { m } from "@ui/motion";
import { colors, theme } from "theme";

import { NAVIGATION_BAR_HEIGHT } from "~/modules/navigation/constants";

type Props = {
  step: number;
  total: number;
  showProgress?: boolean;
  /** Already translated — this component draws chrome, not copy. */
  label: string;
  /** Shown under the label on the last step, where the action is worth explaining. */
  sublabel?: string;
  variant?: "primary" | "secondary";
  /**
   * Nothing to move on with: the step's answer is missing in a way the user cannot be asked to fix
   * here. The bar dims rather than hiding, so the way forward stays where it was.
   */
  disabled?: boolean;
  /** The step is writing. The pill takes the press away for the round trip rather than queueing it. */
  isLoading?: boolean;
  onNext: () => void;
  onBack?: () => void;
  /** Leaving the first step abandons the tunnel, so it closes rather than goes back. */
  backIcon?: Icon;
  nextIcon?: Icon;
  style?: ViewStyle;
};

/**
 * The tunnel's own bottom bar: a dark disc to leave by, and a pill to go on with.
 *
 * A separate component from the global `NavigationBar` rather than a mode of it. That bar is a
 * standing offer — ask Cuisko anything, from anywhere — and this one is the single next move in a
 * flow with an end. Folding the two together would make the global bar answerable to every screen
 * that ever wants a different button in it. They share only the geometry, imported above, so the
 * two sit at the same height on the same phone.
 */
export const TunnelBar = ({
  step,
  total,
  label,
  sublabel,
  variant = "primary",
  disabled = false,
  isLoading = false,
  showProgress = true,
  onNext,
  onBack,
  backIcon,
  nextIcon = ArrowRight,
  style,
}: Props) => {
  const isLast = step === total;

  return (
    <m.View
      style={[styles.container, style]}
      from={{ opacity: 0, translateY: NAVIGATION_BAR_HEIGHT }}
      animate={{ opacity: 1, translateY: 0 }}
      exit={{ opacity: 0, translateY: NAVIGATION_BAR_HEIGHT }}
      transition={{ type: "timing", duration: 300, delay: 300 }}
    >
      <SafeAreaView
        style={styles.flex}
        edges={{ bottom: "android", top: "off" }}
      >
        {onBack && <ButtonIcon
          elevated
          variant="neutral-inverted"
          size="lg"
          onPress={onBack}
          style={styles.back}
        >
          {backIcon ?? (step === 1 ? X : ArrowLeft)}
        </ButtonIcon>}
        <ButtonPill
          elevated
          variant={variant}
          size="lg"
          disabled={disabled}
          isLoading={isLoading}
          onPress={onNext}
          rightIcon={isLast ? ListPlus : nextIcon}
          onRightPress={onNext}
          leftContent={showProgress && (
            isLast ? undefined : (
              <Text.Base color={colors.primary.subtle} weight={600}>
                {step}/{total}
              </Text.Base>
            )
          )}
        >
          <View style={styles.labels}>
            <Text.Base
              color={variant === "secondary" ? colors.secondary.foreground : colors.primary.foreground}
              weight={700}
            >
              {label}
            </Text.Base>
            {sublabel && (
              <Text.Sm
                color={variant === "secondary" ? colors.secondary.subtle : colors.primary.subtle}
                style={styles.sublabel}
              >
                {sublabel}
              </Text.Sm>
            )}
          </View>
        </ButtonPill>
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
    paddingHorizontal: theme.spacing[16],
    paddingBottom: theme.spacing[24],
  },
  flex: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[16],
  },
  back: { alignSelf: "auto" },
  labels: { flexShrink: 0, marginRight: theme.spacing[6] },
  sublabel: { marginTop: 1 },
});
