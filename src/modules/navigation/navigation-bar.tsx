import { StyleSheet, View } from "react-native";

import { ButtonIcon } from "@ui/button-icon";
import { ButtonPill } from "@ui/button-pill";
import { Camera, ForkKnife, MicIcon } from "@ui/icons";
import { theme } from "theme";
import { useTranslations } from "translations";

const MIC_ICON_SIZE = 20;

/**
 * The bar that floats over every page: ask Cuisko anything, or go straight to cooking.
 *
 * It lives in its own module rather than in `home/` because it is not part of any one page — a
 * route renders it beside its screen, and the screen it sits over knows nothing about it. That
 * independence is also what lets it keep animation state across a navigation later.
 *
 * A sibling of the page rather than a child, so it stays put while the page scrolls. Whatever
 * renders it is responsible for leaving room at the bottom of the scroll.
 */
export const NavigationBar = () => {
  const t = useTranslations("Navigation");

  return (
    <View style={styles.container}>
      <ButtonPill
        elevated
        variant="neutral"
        leftIcon={Camera}
        onPress={() => console.log("camera pressed")}
        rightContent={<MicIcon size={MIC_ICON_SIZE} color={theme.colors.foreground} />}
        size="lg"
      >
        {t("ask_anything")}
      </ButtonPill>
      <ButtonIcon
        elevated
        variant="secondary"
        onPress={() => console.log("fork knife pressed")}
        size="lg"
      >
        {ForkKnife}
      </ButtonIcon>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing[16],
    paddingBottom: theme.spacing[24],
  },
});
