import type { AssistantButton, ButtonDestination } from "@shared/assistant";
import { type Href, router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useTranslations } from "translations";

import { ButtonPill } from "@ui/button-pill";
import { CalendarPlus, ForkKnife, type Icon, ShoppingCart } from "@ui/icons";
import { Message } from "@ui/message";
import { theme } from "theme";

type Props = {
  button: AssistantButton;
};

/**
 * Where each destination Cuisko can name leads, and what its pill shows.
 *
 * The client's half of `showButton`: the model names a place, this says which screen that is.
 * Planning opens the tunnel's first step rather than the plan, because a cook sent there from
 * the chat came to build one. A `Record` so a new destination cannot ship without a route.
 */
const _DESTINATIONS: Record<ButtonDestination, { href: Href; icon: Icon }> = {
  planning: { href: "/planning/new/setup", icon: CalendarPlus },
  groceries: { href: "/groceries", icon: ShoppingCart },
  recipes: { href: "/recipes", icon: ForkKnife },
};

/**
 * Cuisko's sentence, then the pill it leads into, under the answer.
 *
 * `replace` rather than `push`, as the empty state's planning button does: the destination is
 * where the cook is going now, and Back from it should reach what was behind this modal, not the
 * conversation that sent them.
 */
export const OfferedButton = ({ button }: Props) => {
  const t = useTranslations("Assistant");
  const { href, icon } = _DESTINATIONS[button.destination];

  return (
    <View style={styles.container}>
      <Message from="assistant" markdown content={button.text} />
      <ButtonPill
        variant={button.variant}
        leftIcon={icon}
        onPress={() => router.replace(href)}
        style={styles.pill}
        elevated
      >
        {t(`buttons.${button.destination}`)}
      </ButtonPill>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing[16],
    alignItems: "flex-start",
  },
  pill: {
    alignSelf: "flex-start",
    marginLeft: -theme.spacing[2],
  },
});
