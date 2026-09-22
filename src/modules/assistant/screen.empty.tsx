import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useTranslations } from "translations";

import { CalendarPlus } from "@ui/icons";
import { Button } from "@ui/button";
import { Image } from "@ui/image";
import { Text } from "@ui/text";
import { colors, theme } from "theme";

import { CUISKO_HEAD } from "~/lib/mascots";

/** Big enough to be the subject of the screen, small enough to leave the words above the fold. */
const HEAD_SIZE = 172;

/**
 * What the assistant says before anyone has asked it anything.
 *
 * Reachable since Quick Access started linking straight here: the navigation bar used to be the
 * only door in, and it always arrived carrying a question. It is a greeting and not an error, so
 * Cuisko is in it — PRODUCT.md only puts the mascot aside when something has gone wrong.
 *
 * **The button is not the way to ask a question**, and deliberately so: the bar to type in is
 * already on screen, and a button pointing at it would be the screen explaining its own furniture.
 * It offers the other thing worth doing instead, so a shopper who opened this with nothing in mind
 * has somewhere to go rather than a blinking cursor.
 *
 * `replace` rather than `push` — the tunnel is a destination, not a step deeper into a
 * conversation that was never started, and Back from it should reach what was behind this modal.
 */
export const AssistantEmpty = () => {
  const t = useTranslations("Assistant");

  return (
    <View style={styles.container}>
      <Image source={CUISKO_HEAD} style={styles.head} contentFit="contain" />
      <Text.H4 style={styles.title}>{t("empty_title")}</Text.H4>
      <Text.Base color={colors.muted} style={styles.body}>
        {t("empty_body")}
      </Text.Base>
      <Button
        variant="primary"
        onPress={() => router.replace("/planning/new/setup")}
        style={styles.action}
        leftIcon={CalendarPlus}
      >
        {t("empty_action")}
      </Button>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: theme.spacing[16],
    paddingTop: 56,
    paddingHorizontal: theme.spacing[24],
    maxWidth: 340,
    marginHorizontal: "auto",
  },
  head: {
    width: HEAD_SIZE,
    height: HEAD_SIZE,
    marginBottom: theme.spacing[12],
  },
  title: { textAlign: "center" },
  body: { textAlign: "center", opacity: 0.8 },
  action: { marginTop: theme.spacing[6] },
});
