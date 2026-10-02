import { StyleSheet, type ViewStyle } from "react-native";

import { theme } from "theme";
import { HeartIcon } from "../icons";
import { Image, type ImageProps } from "../image";
import { Pressable } from "../pressable";
import { Text } from "../text";
import { BlurScope, BlurTarget, BlurView } from "../blur-view";
import { useBlurTarget } from "@ui/hooks/useBlurTarget";

const PHOTO_SIZE = 84;
const BADGE_COLOR = theme.colors.primary.base;

type Props = {
  imageSrc: ImageProps["source"];
  /** Absent when the dish has no score: the badge is left out rather than showing a guess. */
  score?: number;
  onPress?: () => void;
  style?: ViewStyle;
};

/** A plate seen from above, with its score in a pill across the bottom edge. */
export const ScoredDish = ({ imageSrc, score, onPress, style }: Props) => {
  /** The badge frosts the photo under it, so the photo is what its blur samples on Android. */
  const photo = useBlurTarget();

  return (
    <Pressable onPress={onPress} style={[styles.container, style]}>
      <BlurTarget target={photo}>
        <Image source={imageSrc} style={styles.photo} contentFit="cover" />
      </BlurTarget>
      {score !== undefined && (
        <BlurScope target={photo}>
          <BlurView style={styles.badge} intensity={4}>
            <HeartIcon
              color={BADGE_COLOR}
              fill={BADGE_COLOR}
              size={14}
            />
            <Text.Base color={BADGE_COLOR}>{score}</Text.Base>
          </BlurView>
        </BlurScope>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", paddingBottom: theme.spacing[12] },
  photo: { width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: theme.radius.full },
  badge: {
    position: "absolute",
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[4],
    paddingVertical: theme.spacing[6],
    paddingHorizontal: theme.spacing[12],
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface.elevated,
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 0,
        blurRadius: 24,
        spreadDistance: 0,
        color: "rgba(0, 0, 0, 0.12)",
      },
    ]
  },
});
