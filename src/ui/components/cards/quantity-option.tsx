import * as Haptics from "expo-haptics";
import { StyleSheet, View, ViewStyle } from "react-native";

import { Pressable } from "@ui/pressable";
import { Text } from "@ui/text";
import { theme } from "theme";

/**
 * One amount to pick from — a tile in the quantity sheet.
 *
 * Drawn like a `GroceryItem` on purpose: the sheet is answering a question about the card that
 * was just tapped, and matching its outline keeps that connection without a word of copy.
 */

type Props = {
  amount: number;
  /** Already formatted by the caller — `src/ui` does not know this domain's units (ADR 0002). */
  unit: string;
  /** Why this tile is the likely answer: "Needed", "Just added". Also draws it accented. */
  caption?: string;
  /** The tile the sheet is proposing, as opposed to one of the alternatives beside it. */
  type?: "undo" | "default";
  width?: number;
  onPress?: () => void;
  style?: ViewStyle;
};

export const QuantityOption = ({ amount, unit, caption, type, width, onPress, style }: Props) => {
  const scheme = type === "undo" && caption ? styles.remove : (caption ? styles.selected : undefined);

  const mainTextColor = !caption ? theme.colors.neutral.base : (type === "undo" ?
    theme.colors.primary.base : theme.colors.secondary.base);

  const unitTextColor = !caption ? theme.colors.neutral.muted : (type === "undo" ?
    theme.colors.primary.base : theme.colors.secondary.base);

  const captionTextColor = !caption ? theme.colors.neutral.muted : (type === "undo" ?
    theme.colors.primary.base : theme.colors.secondary.base);

  return (
    <Pressable
      intensity={0.9}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress?.();
      }}
      style={{ ...styles.container, ...(scheme ? scheme : {}), width, ...style }}
    >
      <View style={styles.amount}>
        <Text.H4 color={mainTextColor}>{amount}</Text.H4>
        <Text.Base color={unitTextColor}>
          {unit}
        </Text.Base>
      </View>
      {caption ? (
        <Text.Sm color={captionTextColor}>{caption}</Text.Sm>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[4],
    paddingHorizontal: theme.spacing[24],
    height: 70,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: theme.colors.neutral.elevated,
    backgroundColor: theme.colors.surface.elevatedSubtle,
  },
  remove: {
    borderWidth: 2,
    borderColor: theme.colors.primary.base,
    backgroundColor: theme.colors.primary.subtle,
  },
  selected: {
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: theme.colors.secondary.base,
    backgroundColor: theme.colors.secondary.subtle,
  },
  amount: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: theme.spacing[6],
  },
});
