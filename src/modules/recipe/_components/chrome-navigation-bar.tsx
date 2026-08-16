import { StyleSheet, ViewStyle } from "react-native";
import { m } from "@ui/motion";

import { NAVIGATION_BAR_HEIGHT } from "~/modules/navigation/constants";
import { ButtonIcon } from "@ui/button-icon";
import { ArrowLeft, Play } from "@ui/icons";
import { ButtonPill } from "@ui/button-pill";
import { theme } from "theme";
import { useTranslations } from "translations";

type Props = {
  style?: ViewStyle,
  onBack?: () => void,
  onStepByStep: () => void,
}

export const ChromeNavigationBar = ({ style, onBack, onStepByStep }: Props) => {
  const t = useTranslations("Recipe");

  return (
    <m.View
      style={[styles.container, style]}
      from={{ opacity: 0, translateY: NAVIGATION_BAR_HEIGHT }}
      animate={{ opacity: 1, translateY: 0 }}
      exit={{ opacity: 0, translateY: NAVIGATION_BAR_HEIGHT }}
      transition={{ type: "timing", duration: 300, delay: 300 }}
    >
      {onBack && <ButtonIcon
        elevated
        variant="neutral-inverted"
        size="md"
        onPress={onBack}
        style={styles.back}
      >
        {ArrowLeft}
      </ButtonIcon>}
      <ButtonPill
        elevated
        variant="secondary"
        size="lg"
        onPress={onStepByStep}
        leftIcon={Play}
      >
        {t("Chrome.start_cooking")}
      </ButtonPill>
    </m.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: NAVIGATION_BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[16],
    paddingHorizontal: theme.spacing[16],
    paddingBottom: theme.spacing[24],
  },
  back: { alignSelf: "auto" },
})
