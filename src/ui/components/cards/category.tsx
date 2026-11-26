import { StyleSheet, View, type ViewStyle } from "react-native";

import { Pressable } from "@ui/pressable";
import { Text } from "@ui/text";
import { colors, theme } from "theme";

type Props = {
  label: string;
  /** A flag or a dish, drawn before the label. The caller picks it: the tile knows no platform. */
  emoji: string;
  isSelected?: boolean;
  onPress: () => void;
  style?: ViewStyle;
};

/**
 * A cuisine to browse: a glyph and its name, on one row.
 *
 * The selected tile is filled with the primary colour, its label in the colour that reads on it:
 * the cook finds the grid's subject at a glance. Said to a screen reader too (`accessibilityState`).
 * A tap navigates, so it gives no haptic (DESIGN §5).
 */
export const CardCategory = ({ label, emoji, isSelected = false, onPress, style }: Props) => (
  <Pressable
    intensity={0.96}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ selected: isSelected }}
    style={{ ...styles.container, ...(isSelected ? styles.selected : null), ...style }}
  >
    <View style={styles.view}>
      {/* A size above the label: the glyph is the tile's picture, not a word. */}
      <Text.Lg>{emoji}</Text.Lg>
      <Text.Base
        weight={600}
        numberOfLines={1}
        style={styles.label}
        color={isSelected ? colors.primary.foreground : colors.foreground}
      >
        {label}
      </Text.Base>
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  container: {
    paddingVertical: theme.spacing[8],
    paddingHorizontal: theme.spacing[24],
    borderWidth: 2,
    borderColor: colors.border.default,
    borderRadius: theme.radius.md,
    backgroundColor: colors.surface.elevated,
  },
  view: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[8],
    minHeight: 44,
  },
  selected: {
    borderColor: colors.border.default,
    backgroundColor: colors.primary.base,
  },
  label: { flexShrink: 1 },
});
