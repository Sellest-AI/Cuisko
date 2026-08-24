import { StyleSheet, ViewStyle } from "react-native";

import { ImageIcon } from "@ui/icons";
import { Pressable } from "@ui/pressable";
import { Text } from "@ui/text";
import { colors, theme } from "theme";

type Props = {
  label: string;
  onPress?: () => void;
  style?: ViewStyle;
};

/**
 * The recipe's photo, before there is one.
 *
 * Dashed rather than filled, and the whole box is the target: an empty slot is the only affordance
 * the screen has to offer until an image exists, so it has to read as one.
 */
export const ImagePicker = ({ label, onPress, style }: Props) => (
  <Pressable style={[styles.picker, style]} onPress={onPress}>
    <ImageIcon
      size={ICON_SIZE}
      strokeWidth={ICON_STROKE}
      color={colors.neutral.elevated}
      style={styles.icon}
    />
    <Text.Lg color={colors.neutral.muted}>{label}</Text.Lg>
  </Pressable>
);

/** Large enough to read as the subject of the box rather than as a bullet next to the label. */
const ICON_SIZE = 64;

/** Thinner than the default: at this size the standard weight reads as a filled shape. */
const ICON_STROKE = 1.5;

const styles = StyleSheet.create({
  picker: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing[32],
    paddingHorizontal: theme.spacing[12],
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: theme.radius.lg,
    borderColor: colors.neutral.elevated,
  },
  icon: { marginBottom: theme.spacing[12] },
});
