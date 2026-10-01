import { StyleSheet, View, type ViewProps } from "react-native";
import { theme } from "theme";
import { Image } from "./image";
import { Pressable } from "./pressable";

type Props = {
  uri: string;
  /** Degrees. Negative leans left; a photo laid on a table is never quite square to it. */
  tilt?: number;
  width?: number;
  style?: ViewProps["style"];
};

/** Portrait, like a phone photo held upright. */
const ASPECT_RATIO = 3 / 4;

/**
 * A photo as a small rounded card, laid at a slight angle with a white mat — the way a picture
 * rides along with a message. Shown beside the navigation bar's field before a question is sent,
 * and inside a sent chat bubble.
 *
 * Draws only: where it sits, and whether it animates in, is the caller's.
 */
export const TiltedPhoto = ({ uri, tilt = -4, width = 84, style }: Props) => {
  const padding = Math.min(4, Math.max(2, Math.round(width * 0.03)));

  return (
    <View
      style={[
        styles.mat,
        style,
        {
          width,
          aspectRatio: ASPECT_RATIO,
          transform: [{ rotate: `${tilt}deg` }],
        },
      ]}
    >
      <Pressable style={[styles.pressable, { padding }]} haptic>
        <Image source={{ uri }} style={styles.photo} contentFit="cover" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  mat: {
    borderRadius: theme.radius.md,
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 4,
        blurRadius: 16,
        spreadDistance: 0,
        color: "rgba(0, 0, 0, 0.1)",
      },
    ],
  },
  photo: {
    flex: 1,
    borderRadius: theme.radius.md - 3,
  },
  pressable: {
    padding: 3,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.background,
    flex: 1,
  }
});
