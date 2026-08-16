import * as Haptics from "expo-haptics";
import { StyleSheet, View, ViewStyle } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";

import { Pressable } from "@ui/pressable";
import { Text } from "@ui/text";
import { theme } from "theme";
import { Image } from "../image";

/**
 * One line of a grocery list — something to buy, or something already owned.
 *
 * The card animates its own position. `layout` asks Reanimated to interpolate from the box this
 * view occupied last render to the box it occupies now, so a card that changes place in the grid
 * flies there instead of jumping — the same idea as Framer Motion's `layout` prop.
 *
 * It only works while the instance stays mounted: a view that unmounts here and mounts somewhere
 * else gets an exit and an enter, never a move. Keeping it mounted is the caller's job, and the
 * reason the grid renders all of its sections from one keyed list.
 */

/** Slow enough to read as a flight, tight enough not to feel like waiting. */
const ITEM_TRANSITION = LinearTransition.springify().damping(14).stiffness(200);

/**
 * A card that appears or leaves is a card the list did not have before, not one that moved — a
 * fade says that, where a spring would imply a flight from somewhere the card never was.
 */
const ITEM_ENTERING = FadeIn.duration(180);
const ITEM_EXITING = FadeOut.duration(140);

/**
 * Three states, because a card can mean three different things:
 *
 * - `pending` — still missing. An open, dashed outline: nothing has happened to it yet.
 * - `recent` — just bought, and still undoable. Accented, so the thing a mistap would need to
 *   find is the thing that stands out.
 * - `settled` — owned, and past the point of being undone. Closed outline, receded.
 * - `memory` — neither owned nor wanted, only remembered. Faded, because there is none of it.
 */
export type GroceryItemVariant = "pending" | "recent" | "settled" | "memory";

type Props = {
  name: string;
  quantity?: string;
  /** Stand-in for the produce photo until real ones exist. */
  emoji: string;
  markerSrc?: string;
  variant?: GroceryItemVariant | "ghost";
  width?: number;
  onPress?: () => void;
  style?: ViewStyle;
};

export const GroceryItem = ({ name, quantity, emoji, markerSrc, variant = "pending", width, onPress, style }: Props) => (
  <Animated.View layout={ITEM_TRANSITION} entering={ITEM_ENTERING} exiting={ITEM_EXITING} style={{ width }}>
    <Pressable
      intensity={0.9}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress?.();
      }}
      style={{ ...styles.container, ...styles[variant], ...style }}
    >
      <Text.H4 style={styles.emoji}>{emoji}</Text.H4>
      <Text.Base color={theme.colors.muted} numberOfLines={1}>
        {name}
      </Text.Base>
      {(quantity || markerSrc) && <View style={styles.quantity}>
        {markerSrc && <View style={styles.marker}>
          <Image
            source={{ uri: markerSrc }}
            style={styles.markerImage}
            contentFit="contain"
          />
        </View>}
        <Text.Sm
          weight={700}
          color={theme.colors.foreground}
          style={variant === "ghost" ? styles.quantityBadge : undefined}
        >
          {quantity}
        </Text.Sm>
      </View>}
    </Pressable>
  </Animated.View>
);

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: theme.spacing[6],
    paddingVertical: theme.spacing[12],
    paddingHorizontal: theme.spacing[8],
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: theme.colors.neutral.elevated,
    backgroundColor: theme.colors.surface.elevatedSubtle,
    minWidth: 100
  },
  ghost: {
    borderWidth: 0,
    backgroundColor: "transparent",
    paddingVertical: 0,
    paddingHorizontal: 0,
    minWidth: 64
  },
  /** Still missing: the container alone already draws it, so there is nothing to add. */
  pending: {},
  /** Just bought: closed like the cellar, but tinted, because this one can still be taken back. */
  recent: {
    borderStyle: "dashed",
    borderWidth: 2,
    borderColor: theme.colors.secondary.elevated,
    backgroundColor: theme.colors.secondary.subtle,
  },
  /** Owned: a closed outline instead of an open one, and receded from the things still missing. */
  settled: {
    borderStyle: "solid",
    borderWidth: 2,
    borderColor: theme.colors.neutral.subtle,
    backgroundColor: theme.colors.surface.elevated,
    opacity: 1,
  },
  /** Remembered: the same open outline as something missing, but dimmed — none of it is here. */
  memory: {
    opacity: 0.7,
  },
  /** Overrides the H4 metrics — an emoji needs the room a heading does not. */
  emoji: {
    fontSize: 40,
    lineHeight: 48,
  },
  quantity: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[4],
  },
  quantityBadge: {
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface.elevatedSubtle,
    borderColor: theme.colors.border.default,
    borderWidth: 2,
    padding: theme.spacing[4],
    paddingHorizontal: theme.spacing[8],
  },
  marker: {
    width: 16,
    height: 16,
  },
  markerImage: {
    width: "100%",
    height: "100%",
  },
});
