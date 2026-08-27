import { StyleSheet, View, ViewStyle } from "react-native";

import { Button } from "@ui/button";
import { Icon, MorphIcon } from "@ui/icons";
import { Text } from "@ui/text";
import { colors, theme } from "theme";

type Props = {
  icon: Icon;
  title: string;
  body: string;
  /**
   * The one thing to do from here, when there is one.
   *
   * Optional because the empties differ in whether they are a dead end: a cook with no recipes yet
   * is already where they need to be and the tab bar is under them, while a recipe that is not
   * theirs to read is a page with nothing else on it — no header, no tabs — and needs its own way
   * out. The screen supplies the label, for the reason it supplies the words above.
   */
  action?: { label: string; icon?: Icon; onPress: () => void };
  style?: ViewStyle;
};

/**
 * What a recipe screen says when it has nothing to draw.
 *
 * It takes its words rather than choosing them, because the empties mean different things: a cook
 * who has written no recipes is at the start of something, a search that matched none of theirs is
 * at a dead end, and a recipe that is not theirs to read is neither. One says "write your first";
 * the others must not, because they already have twenty and it would read as the app losing them.
 *
 * The screen picks which. Keeping that decision there rather than here is what stops this growing a
 * `variant` prop and, with it, an opinion about a query string it cannot see.
 */
export const EmptyState = ({ icon, title, body, action, style }: Props) => (
  <View style={[styles.container, style]}>
    <MorphIcon icon={icon} size={ICON_SIZE} color={colors.muted} />
    <Text.Lg style={styles.title}>{title}</Text.Lg>
    <Text.Base color={colors.muted} style={styles.body}>
      {body}
    </Text.Base>
    {action && (
      <Button
        elevated
        variant="secondary"
        leftIcon={action.icon}
        onPress={action.onPress}
        style={styles.action}
      >
        {action.label}
      </Button>
    )}
  </View>
);

const ICON_SIZE = 32;

const styles = StyleSheet.create({
  /**
   * Padded rather than centred in the viewport: on the grid the header — title, search box — is
   * above it, and vertical centring would push this under the fold on a short screen.
   */
  container: {
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing[12],
    paddingTop: theme.spacing[32],
    paddingHorizontal: theme.spacing[24],
    maxWidth: 320,
    marginHorizontal: "auto",
  },
  title: { textAlign: "center" },
  body: { textAlign: "center", opacity: 0.8 },
  action: { marginTop: theme.spacing[8] },
});
