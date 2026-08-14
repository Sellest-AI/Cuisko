import { StyleSheet, View, ViewStyle } from "react-native";

import { Badge } from "@ui/badge";
import { Icon, IconComponent, MoonIcon, SmileIcon, SunIcon } from "@ui/icons";
import { Image, ImageProps } from "@ui/image";
import { Pressable } from "@ui/pressable";
import { Text } from "@ui/text";
import { ButtonIcon } from "@ui/button-icon";
import { colors, theme } from "theme";

/**
 * How far a plate has got. The union drives colour and icon so the four states stay exhaustive and
 * consistent wherever the card is drawn; the label itself arrives as a prop, because `src/ui/**`
 * may not read translations (ADR 0002).
 *
 * `empty` is not a failure — it is a plate nobody has filled yet, and it reads as an invitation.
 */
export type MealStatus = "cooked" | "ready" | "shopping-needed" | "empty";

type Props = {
  title: string;
  /** Sits under the title where there is no cooking time to show — an unfilled plate's invitation. */
  subtitle?: string;
  /** Already formatted — `55 minutes`. The card does not know the user's language. */
  duration?: string;
  servings?: number;
  slot?: "lunch" | "dinner";
  /** Translated by the caller; `slot` alone decides the sun or the moon beside it. */
  slotLabel?: string;
  status?: MealStatus;
  /** Translated by the caller; `status` alone decides how the pill is coloured. */
  statusLabel?: string;
  statusIcon?: IconComponent;
  /** Stands in for a cuisine icon beside the cooking time until real ones exist. */
  emoji?: string;
  imageSrc?: ImageProps["source"];
  onPress?: () => void;
  /** The swap arrows in the tunnel, the overflow dots on the planning screen. */
  trailingIcon?: Icon;
  onTrailingPress?: () => void;
  style?: ViewStyle;
};

const PLATE_SIZE = 104;

/**
 * One plate in the plan: what it is, how long it takes, and whether it can be cooked tonight.
 *
 * The photograph sits half outside the card rather than inside it — the plate is the subject and
 * the card is the label beside it, which is why the image overlaps the card's left edge instead of
 * being framed by it.
 */
export const CardMeal = ({
  title,
  subtitle,
  duration,
  servings,
  slot,
  slotLabel,
  status = "ready",
  statusLabel,
  statusIcon,
  emoji,
  imageSrc,
  onPress,
  trailingIcon,
  onTrailingPress,
  style,
}: Props) => {
  const SlotIcon = slot === "dinner" ? MoonIcon : SunIcon;
  const StatusIcon = statusIcon;
  const isEmpty = status === "empty";

  return (
    <View style={[styles.row, style]}>
      <Pressable
        style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
        onPress={onPress}
      >
        <Image
          source={imageSrc}
          contentFit="contain"
          style={styles.plate}
          // The plate is the card's subject, drawn beside the text rather than inside a frame.
          pointerEvents="none"
        />
        <View style={styles.body}>
          <View style={{ ...styles.cardContent, ...(isEmpty ? styles.cardEmpty : null) }}>
            <View style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: theme.spacing[8],
            }}>
              <View>
                <Text.Base
                  color={isEmpty ? theme.colors.muted : theme.colors.foreground}
                  numberOfLines={1}
                  style={styles.title}
                >
                  {title}
                </Text.Base>
                {subtitle && (
                  <Text.Sm color={theme.colors.muted} numberOfLines={1}>
                    {subtitle}
                  </Text.Sm>
                )}
              </View>
              {status === "empty" && <View style={styles.trailing}>
                {trailingIcon && (
                  <ButtonIcon
                    elevated
                    variant="primary"
                    onPress={onTrailingPress}
                    size="md"
                  >
                    {trailingIcon}
                  </ButtonIcon>
                )}
              </View>}
            </View>
            {(duration || servings !== undefined) && (
              <View style={styles.meta}>
                {emoji && <Text.Sm style={styles.emoji}>{emoji}</Text.Sm>}
                {duration && <Text.Sm color={theme.colors.muted}>{duration}</Text.Sm>}
                {duration && servings !== undefined && (
                  <Text.Sm color={theme.colors.neutral.elevated}>·</Text.Sm>
                )}
                {servings !== undefined && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
                    <SmileIcon size={12} style={{ marginTop: 2 }} color={theme.colors.secondary.base} />
                    <Text.Sm color={theme.colors.secondary.base}>{servings}</Text.Sm>
                  </View>
                )}
              </View>
            )}
          </View>
          <View style={styles.tags}>
            {slotLabel && (
              <Badge icon={SlotIcon}>
                {slotLabel}
              </Badge>
            )}
            {statusLabel && (
              <Badge
                icon={StatusIcon}
                variant={status === "cooked" ? "subtle" :
                  status === "shopping-needed" ? "warning" :
                    status === "ready" ? "success" : "neutral"}
              >
                {statusLabel}
              </Badge>
            )}
          </View>
        </View>
      </Pressable>
      {status !== "empty" && <View style={styles.trailing}>
        {trailingIcon && (
          <ButtonIcon variant="neutral-subtle" size="xs" onPress={onTrailingPress}
          >
            {trailingIcon}
          </ButtonIcon>
        )}
      </View>}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  plate: {
    width: PLATE_SIZE,
    height: PLATE_SIZE,
    /** Overlaps the card so the plate reads as sitting on it, not inside it. */
    marginRight: -10,
    zIndex: 1,
  },
  cardContent: {
    backgroundColor: colors.surface.elevatedSubtle,
    paddingVertical: theme.spacing[8],
    paddingHorizontal: theme.spacing[16],
    borderWidth: 2,
    borderColor: colors.border.default,
    borderRadius: 128,
    borderTopLeftRadius: 96,
    borderBottomLeftRadius: 48,
  },
  /** An unfilled plate is an outline: there is nothing in it yet to give a surface to. */
  cardEmpty: {
    borderStyle: "dashed",
    borderColor: colors.neutral.elevated,
    backgroundColor: "transparent",
    paddingRight: theme.spacing[8],
    paddingLeft: theme.spacing[20],
  },
  body: { gap: theme.spacing[6] },
  title: { paddingRight: theme.spacing[8], marginBottom: theme.spacing[2] },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[4],
  },
  emoji: { fontSize: 13, lineHeight: 15 },
  tags: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[6],
    marginTop: theme.spacing[2],
  },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[4],
    paddingHorizontal: theme.spacing[8],
    paddingVertical: theme.spacing[4],
    borderRadius: theme.radius.full,
    borderWidth: 2,
  },
  /** A fixed rail, so every card's text ends on the same line whether it has a trailing control. */
  trailing: {
    alignItems: "center",
    justifyContent: "center",
  },
});
