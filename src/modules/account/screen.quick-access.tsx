import { StyleSheet, View } from "react-native";
import type { Href } from "expo-router";

import { ButtonPill } from "@ui/button-pill";
import { ForkKnife, SlidersHorizontal } from "@ui/icons";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";
import { AskCuiskoPill } from "~/modules/assistant/ask-cuisko-pill";

type Props = {
  /** Leaves the drawer for `href`. The drawer decides how: it slides out first, then navigates. */
  onGo: (href: Href) => void;
};

/** The places the account drawer sends you: your recipes, the assistant, your preferences. */
export const AccountQuickAccess = ({ onGo }: Props) => {
  const t = useTranslations("Account");
  const tHome = useTranslations("Home");

  return (
    <View style={styles.section}>
      <Text.Lg>{t("QuickAccess.title")}</Text.Lg>
      <ButtonPill variant="secondary" size="md" elevated leftIcon={ForkKnife} onPress={() => onGo("/recipes")}>
        {t("QuickAccess.my_recipes")}
      </ButtonPill>
      <AskCuiskoPill onPress={() => onGo("/assistant")}>
        {tHome("QuickAccess.ask_cuisko")}
      </AskCuiskoPill>
      <ButtonPill variant="neutral" size="md" leftIcon={SlidersHorizontal} onPress={() => onGo("/preferences")}>
        {t("QuickAccess.preferences")}
      </ButtonPill>
    </View>
  );
};

const styles = StyleSheet.create({
  section: { gap: theme.spacing[12] },
});
