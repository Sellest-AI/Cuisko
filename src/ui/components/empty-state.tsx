import { StyleSheet, View, ViewStyle } from "react-native";

import { Button } from "@ui/button";
import { Icon, MorphIcon } from "@ui/icons";
import { Text } from "@ui/text";
import { colors, theme } from "theme";

type EmptyStateAction = { label: string; icon?: Icon; onPress: () => void, variant?: "primary" | "secondary" | "neutral" };

type Props = {
  icon: Icon;
  title: string;
  body: string;
  /**
   * The ways on from here, when there are any: the first leads, and a second is drawn quieter.
   *
   * Optional because the empties differ in whether they are a dead end: a search that matched
   * nothing is already where the cook needs to be, while a recipe that is not theirs to read is a
   * page with nothing else on it — no header, no tabs — and needs its own way out. The caller
   * supplies the labels, for the reason it supplies the words above.
   */
  actions?: EmptyStateAction[];
  style?: ViewStyle;
};

/**
 * What a screen says when it has nothing to draw.
 *
 * It takes its words rather than choosing them, because the empties mean different things: a cook
 * who has no recipes is at the start of something, a search that matched nothing is at a dead end,
 * and a recipe that is not theirs to read is neither. One says "write your first"; the others must
 * not, because they already have twenty and it would read as the app losing them.
 *
 * The caller picks which. Keeping that decision there rather than here is what stops this growing a
 * `variant` prop and, with it, an opinion about data it cannot see.
 */
export const EmptyState = ({ icon, title, body, actions = [], style }: Props) => (
  <View style={[styles.container, style]}>
    <MorphIcon icon={icon} size={ICON_SIZE} color={colors.muted} strokeWidth={1.5} />
    <Text.Lg style={styles.title}>{title}</Text.Lg>
    <Text.Base color={colors.muted} style={styles.body}>
      {body}
    </Text.Base>
    {actions.length > 0 && (
      <View style={styles.actions}>
        {actions.map((action, index) => (
          <Button
            key={action.label}
            elevated={index === 0}
            variant={action.variant || (index === 0 ? "secondary" : "neutral")}
            leftIcon={action.icon}
            onPress={action.onPress}
          >
            {action.label}
          </Button>
        ))}
      </View>
    )}
  </View>
);

const ICON_SIZE = 64;

const styles = StyleSheet.create({
  /**
   * Padded rather than centred in the viewport: on a list the header — title, search box — is
   * above it, and vertical centring would push this under the fold on a short screen.
   */
  container: {
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing[20],
    paddingTop: 56,
    paddingBottom: 48,
    paddingHorizontal: theme.spacing[24],
    maxWidth: 320,
    marginHorizontal: "auto",
  },
  title: { textAlign: "center" },
  body: { textAlign: "center", opacity: 0.8 },
  actions: { alignItems: "center", gap: theme.spacing[12], marginTop: theme.spacing[12] },
});
