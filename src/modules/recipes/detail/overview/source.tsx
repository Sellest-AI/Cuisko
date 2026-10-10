import { StyleSheet, ViewProps } from "react-native";

import { theme } from "theme";
import { useTranslations } from "translations";
import { Pressable } from "@ui/pressable";
import { LinkIcon } from "@ui/icons";
import { Text } from "@ui/text";
import { openInBrowser } from "~/lib/openInBrowser";

type Props = {
  /** The page the recipe was imported from. The server ships it only to the owner and to an admin. */
  url: string;
  style?: ViewProps["style"];
};

/**
 * The way back to the page the recipe came from.
 *
 * Opened in the in-app browser rather than handed to the system: the cook reads the page and closes
 * it onto the recipe they were on.
 */
export const Source = ({ url, style }: Props) => {
  const t = useTranslations("Recipe");

  return (
    <Pressable style={[styles.container, style]} onPress={() => openInBrowser(url)}>
      <LinkIcon size={16} />
      <Text.Base>{t("Overview.source")}</Text.Base>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[8],
  },
});
