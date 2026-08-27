import { StyleSheet, View } from "react-native";

import { Icon, MorphIcon } from "@ui/icons";
import { Text } from "@ui/text";
import { colors, theme } from "theme";

type Props = {
  icon: Icon;
  title: string;
  body: string;
};

/**
 * What the grid says when it has nothing to draw.
 *
 * It takes its words rather than choosing them, because there are two empties and they mean
 * opposite things: a cook who has written no recipes is at the start of something, and a search
 * that matched none of theirs is at a dead end. One says "write your first"; the other must not,
 * because they already have twenty and this would read as though the app had lost them.
 *
 * The screen picks which. Keeping that decision there rather than here is what stops this growing a
 * `variant` prop and, with it, an opinion about a query string it cannot see.
 */
export const RecipesEmpty = ({ icon, title, body }: Props) => (
  <View style={styles.container}>
    <MorphIcon icon={icon} size={ICON_SIZE} color={colors.muted} />
    <Text.Lg style={styles.title}>{title}</Text.Lg>
    <Text.Base color={colors.muted} style={styles.body}>
      {body}
    </Text.Base>
  </View>
);

const ICON_SIZE = 32;

const styles = StyleSheet.create({
  /**
   * Padded rather than centred in the viewport: the list header — title, search box — is above it,
   * and vertical centring would push this under the fold on a short screen.
   */
  container: {
    alignItems: "center",
    gap: theme.spacing[12],
    paddingTop: theme.spacing[32],
    paddingHorizontal: theme.spacing[24],
  },
  title: { textAlign: "center" },
  body: { textAlign: "center", opacity: 0.8 },
});
