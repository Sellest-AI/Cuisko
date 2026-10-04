import { Linking, StyleSheet, ViewProps } from "react-native";
import * as WebBrowser from "expo-web-browser";

import { theme } from "theme";
import { useTranslations } from "translations";
import { Pressable } from "@ui/pressable";
import { LinkIcon } from "@ui/icons";
import { Text } from "@ui/text";

type Props = {
  /** The page the recipe was imported from. The server ships it only to the owner and to an admin. */
  url: string;
  style?: ViewProps["style"];
};

/**
 * The way back to the page the recipe came from.
 *
 * Opened in the in-app browser rather than handed to the system: the cook reads the page and closes
 * it onto the recipe they were on, and the same call opens a tab on web. When it cannot open — a
 * sheet already presenting, a phone with no browser able to host one — the system opens the page
 * instead, so the tap is never lost.
 */
export const Source = ({ url, style }: Props) => {
  const t = useTranslations("Recipe");

  return (
    <Pressable style={[styles.container, style]} onPress={() => void WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url))}>
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
