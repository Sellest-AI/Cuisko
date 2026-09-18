import { StyleSheet, View, ViewStyle } from "react-native";

import { Image } from "@ui/image";
import { ImageIcon } from "@ui/icons";
import { Pressable } from "@ui/pressable";
import { Text } from "@ui/text";
import { colors, theme } from "theme";

type Props = {
  label: string;
  onPress?: () => void;
  style?: ViewStyle;
  imageSrc?: string;
};

/**
 * The recipe's photo — shown when there is one, offered as an empty slot when there is not.
 *
 * With an image, the box only displays it: replacing the photo is not wired yet, so a press target
 * over it would promise something the screen cannot do.
 *
 * Without one, dashed rather than filled, and the whole box is the target: an empty slot is the
 * only affordance the screen has to offer until an image exists, so it has to read as one.
 */
export const ImagePicker = ({ label, onPress, style, imageSrc }: Props) => {
  if (imageSrc)
    return (
      <View style={[styles.frame, style]}>
        <Image source={{ uri: imageSrc }} style={styles.image} />
      </View>
    );

  return (
    <Pressable style={[styles.frame, styles.empty, style]} onPress={onPress}>
      <ImageIcon
        size={ICON_SIZE}
        strokeWidth={ICON_STROKE}
        color={colors.neutral.elevated}
        style={styles.icon}
      />
      <Text.Lg color={colors.neutral.muted}>{label}</Text.Lg>
    </Pressable>
  );
};

/** Large enough to read as the subject of the box rather than as a bullet next to the label. */
const ICON_SIZE = 64;

/** Thinner than the default: at this size the standard weight reads as a filled shape. */
const ICON_STROKE = 1.5;

const styles = StyleSheet.create({
  frame: {
    alignItems: "center",
    borderRadius: theme.radius.lg,
    justifyContent: "center",
    overflow: "hidden",
  },
  /** The photo's own proportions, so the frame is as tall as the image rather than a guess. */
  image: { width: "100%", aspectRatio: 3 / 2 },
  empty: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.neutral.elevated,
    paddingVertical: theme.spacing[32],
    paddingHorizontal: theme.spacing[12],
  },
  icon: { marginBottom: theme.spacing[12] },
});
