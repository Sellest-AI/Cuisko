import { View, StyleSheet, ViewStyle } from "react-native";
import { Pressable } from "@ui/pressable";
import { Badge } from "@ui/badge";
import { EyeIcon, StarIcon } from "@ui/icons";
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
  onPress?: () => void,
}

export const CardRecipe = ({ style, imageSrc, title, subtitle, rating, views, onPress }: Props) => {
  return (
    <Pressable style={{ ...styles.container, ...style }} onPress={onPress}>
      <View style={styles.imageCard}>
        <Image
          source={imageSrc}
          contentFit="cover"
          style={styles.imageCard}
        />
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
      <View style={{ paddingLeft: theme.spacing[12], gap: 2 }}>
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
    overflow: "hidden",
    backgroundColor: theme.colors.surface.elevatedSubtle,
    borderColor: theme.colors.border.default,
    borderWidth: 2,
    gap: theme.spacing[8],
    padding: theme.spacing[6],
    paddingBottom: theme.spacing[12],
  },
  imageCard: {
    aspectRatio: 4 / 3,
    width: "100%",
    borderRadius: theme.radius.lg - 4,
    overflow: "hidden",
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
