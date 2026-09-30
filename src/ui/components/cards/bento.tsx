import { View, StyleSheet, type ViewProps } from "react-native";

import { theme } from "theme";

/**
 * The tile the recipe screen's facts sit in: nutrients, the Cui-Score, difficulty, timings. One
 * surface, so a change to its border, fill or radius is made once rather than per card.
 *
 * Padding 12 by default. A card that needs more passes its own in `style`, which comes after the
 * base and so wins; so does anything else a card lays out with (direction, gap, alignment).
 */
export const BentoCard = ({ style, ...props }: ViewProps) => (
  <View style={[styles.bento, style]} {...props} />
);

const styles = StyleSheet.create({
  bento: {
    padding: theme.spacing[12],
    borderRadius: theme.radius.sm,
    borderWidth: 2,
    borderColor: theme.colors.border.default,
    backgroundColor: theme.colors.surface.elevatedSubtle,
  },
});
