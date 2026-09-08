import { StyleSheet, ViewStyle, View } from "react-native";

import { CheckIcon } from "@ui/icons";
import { Pressable } from "@ui/pressable";
import { Text } from "@ui/text";
import { colors, theme } from "theme";
import { LinearGradient } from "expo-linear-gradient";

type Props = {
  style?: ViewStyle;
  selected?: boolean;
  /**
   * Drawn flat and unresponsive — the row is a legal answer the user has run out of room for, not
   * one that does not exist. Never set on a row already picked: turning one off is how the user
   * makes room, so a full list has to stay shrinkable.
   */
  disabled?: boolean;
  label: string;
  emoji: string;
  onPress?: () => void;
  isMultiSelect?: boolean;
};

/**
 * A word, a glyph and a state — the row the tunnel's idea-shaped questions are answered from.
 *
 * A row rather than one of `CardChoice`'s tiles because these ask about an idea: there is no
 * photograph of "gut friendly", and the tile clips its label to fit under the picture, which turns
 * half of these into prefixes. Given the full width, the label is simply readable.
 */
export const RowCardChoice = ({ isMultiSelect, selected, disabled, label, emoji, onPress, style }: Props) => (
  <Pressable
    disabled={disabled || !onPress}
    onPress={onPress}
    intensity={0.98}
    style={[
      styles.container,
      styles.shadow,
      selected && styles.selected,
      disabled && styles.disabled,
      style,
    ]}
  >
    {selected && <LinearGradient
      colors={[colors.primary.base, colors.primary.elevated]}
      start={{ x: 0, y: 1 }}
      end={{ x: 1, y: -1 }}
      style={styles.gradient}
    />}
    <View style={[
      styles.icon,
      selected && styles.selectedIcon,
      disabled && { opacity: 0.8 }
    ]}>
      <Text.H4>{emoji}</Text.H4>
    </View>
    <Text.Lg
      numberOfLines={2}
      style={{
        ...(selected && styles.selectedText),
        ...(disabled && styles.disabledText),
      }}
    >
      {label}
    </Text.Lg>
    {isMultiSelect && (
      <View style={[styles.tickContainer, selected && styles.tickContainerSelected]}>
        {selected && (
          <CheckIcon
            size={16}
            color={colors.primary.base}
            strokeWidth={3}
          />
        )}
      </View>
    )}
  </Pressable>
);

const styles = StyleSheet.create({
  container: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    paddingVertical: theme.spacing[12],
    paddingHorizontal: theme.spacing[12],
    gap: theme.spacing[16],
    borderRadius: theme.radius.lg,
    borderWidth: 2,
    borderColor: colors.border.default,
    backgroundColor: colors.surface.elevated,
    overflow: "hidden",
  },
  shadow: {
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 4,
        blurRadius: 32,
        spreadDistance: 0,
        color: "rgba(0, 0, 0, 0.05)",
      },
    ],
  },
  selected: {
    borderColor: colors.primary.subtle,
    backgroundColor: colors.primary.base,
  },
  gradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: -1,
  },
  /** Flat, not hidden: the row still has to be readable, or the ceiling looks like a bug. */
  disabled: {
    opacity: 0.45,
    boxShadow: undefined,
  },
  selectedIcon: {
    backgroundColor: colors.primary.elevated,
  },
  selectedText: {
    color: colors.primary.foreground,
  },
  disabledText: {
    color: colors.neutral.muted,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.full,
    backgroundColor: colors.neutral.subtle,
    justifyContent: "center",
    alignItems: "center",
  },
  tickContainer: {
    marginLeft: "auto",
    marginRight: theme.spacing[8],
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.neutral.elevated,
    borderRadius: theme.radius.xs,
  },
  tickContainerSelected: {
    backgroundColor: colors.primary.subtle,
  },
});
