import { StyleSheet, ViewStyle } from "react-native";
import { m } from "@ui/motion";

import { NAVIGATION_BAR_HEIGHT } from "~/modules/navigation/constants";
import { ButtonIcon } from "@ui/button-icon";
import { ArrowLeft, Play } from "@ui/icons";
import { ButtonPill } from "@ui/button-pill";
import { theme } from "theme";
import { useTranslations } from "translations";
import { SafeAreaView } from "@ui/safe-area-view";

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
      <SafeAreaView
        edges={{ bottom: "android", top: "off" }}
        style={styles.flex}
      >
        {onBack && <ButtonIcon
          elevated
          variant="neutral-inverted"
          size="lg"
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
          style={styles.elevated}
        >
          {t("Chrome.start_cooking")}
        </ButtonPill>
      </SafeAreaView>
    </m.View>
  )
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
  elevated: {
    boxShadow: [
      {
        offsetX: 2,
        offsetY: -2,
        blurRadius: 32,
        spreadDistance: 5,
        color: "rgba(0, 0, 0, 0.07)",
      },
    ],
  },
})
