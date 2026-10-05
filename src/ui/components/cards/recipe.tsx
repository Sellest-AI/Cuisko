import { View, StyleSheet, ViewStyle } from "react-native";
import { useState } from "react";
import Svg, { Line } from "react-native-svg";
import { Pressable } from "@ui/pressable";
import { Badge } from "@ui/badge";
import { EyeIcon, Loader, StarIcon } from "@ui/icons";
import { theme } from "theme";
import { Image, ImageProps } from "@ui/image";
import { Text } from "@ui/text";
import { formatCompact, formatRating } from "@ui/utils";

type Props = {
  style?: ViewStyle,
  imageSrc?: ImageProps["source"],
  title: string,
  subtitle?: string,
  rating?: number,
  views?: number,
  /** A recipe still on its way: stripes and a spinner where the cover goes. */
  pending?: boolean,
  onPress?: () => void,
}

/** The gap between two stripes of a pending cover, measured along its top edge. */
const STRIPE_GAP = 28;

/**
 * Diagonal hatching over the placeholder grey: a slot held for a recipe that has no picture yet.
 *
 * Each stripe is one line from the top edge to the bottom, drawn from the cover's measured size
 * rather than tiled from a pattern: a tile repeats a short segment, which reads as dashes.
 */
const PendingCover = () => {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { width, height } = size;

  // Starts far enough left that the last stripe still reaches the bottom-right corner.
  const starts = Array.from({ length: Math.ceil((width + height) / STRIPE_GAP) + 1 }, (_, index) => index * STRIPE_GAP);

  return (
    <View
      style={[styles.imageCard, styles.pending]}
      onLayout={({ nativeEvent }) => setSize({ width: nativeEvent.layout.width, height: nativeEvent.layout.height })}
    >
      <Svg style={StyleSheet.absoluteFill}>
        {starts.map((x) => (
          <Line key={x} x1={x} y1={0} x2={x - height} y2={height} stroke={theme.colors.background} strokeWidth={1.5} />
        ))}
      </Svg>
      <Loader size={32} color={theme.colors.foreground} />
    </View>
  );
};

export const CardRecipe = ({ style, imageSrc, title, subtitle, rating, views, pending, onPress }: Props) => {
  return (
    <Pressable style={{ ...styles.container, ...style }} onPress={onPress}>
      <View style={styles.imageCard}>
        {pending ? <PendingCover /> : (
          <Image
            source={imageSrc}
            contentFit="cover"
            style={styles.imageCard}
          />
        )}
        {views !== undefined && (
          <Badge icon={EyeIcon} style={[styles.badge, styles.badgeLeft]}>
            {formatCompact(views)}
          </Badge>
        )}
        {rating !== undefined && (
          <Badge icon={StarIcon} style={[styles.badge, styles.badgeRight]}>
            {formatRating(rating)}
          </Badge>
        )}
      </View>
      <View style={{ paddingLeft: theme.spacing[8], gap: 2 }}>
        <Text.Base color={theme.colors.foreground} numberOfLines={1}>
          {title}
        </Text.Base>
        {subtitle && <Text.Sm color={theme.colors.muted} numberOfLines={1}>
          {subtitle}
        </Text.Sm>}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    maxWidth: 220,
    borderRadius: theme.radius.lg,
    borderBottomLeftRadius: theme.radius.md,
    borderBottomRightRadius: theme.radius.md,
    overflow: "hidden",
    backgroundColor: theme.colors.surface.elevatedSubtle,
    borderColor: theme.colors.border.default,
    borderWidth: 2,
    gap: theme.spacing[8],
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[12],
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 2,
        blurRadius: 16,
        spreadDistance: 0,
        color: "rgba(0, 0, 0, 0.07)",
      },
    ],
  },
  imageCard: {
    aspectRatio: 4 / 3,
    width: "100%",
    borderRadius: theme.radius.lg - 4,
    overflow: "hidden",
  },
  pending: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.neutral.subtle,
  },
  badgeLeft: {
    left: theme.spacing[8]
  },
  badgeRight: {
    right: theme.spacing[8]
  },
  badge: {
    position: "absolute",
    top: theme.spacing[8]
  }
})
