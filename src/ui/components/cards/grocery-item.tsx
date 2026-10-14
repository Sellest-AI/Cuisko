import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useIsMotionAllowed } from "@ui/hooks/useIsMotionAllowed";
import { Pressable } from "@ui/pressable";
import { Text } from "@ui/text";
import { theme } from "theme";
import { Image, type ImageProps } from "../image";
import { ClockAlertIcon } from "../icons";

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
const ITEM_TRANSITION = LinearTransition.springify().damping(85).stiffness(700);

/**
 * A card that appears or leaves is a card the list did not have before, not one that moved — a
 * fade says that, where a spring would imply a flight from somewhere the card never was.
 */
const ITEM_ENTERING = FadeIn.duration(180);
const ITEM_EXITING = FadeOut.duration(140);

/**
 * The states a card can be in, because a card can mean several different things:
 *
 * - `pending` — still missing. An open, dashed outline: nothing has happened to it yet.
 * - `recent` — just bought, and still undoable. Accented, so the thing a mistap would need to
 *   find is the thing that stands out.
 * - `settled` — owned, and past the point of being undone. Closed outline, receded.
 * - `memory` — neither owned nor wanted, only remembered. Faded, because there is none of it.
 * - `resolving` — not on the list yet: something the shopper typed that we are still working out.
 *   It breathes, because the one thing it has to say is that the app has not stopped.
 * - `failed` — that word will not become a line. Outlined in the danger colour, and the only
 *   variant whose tap dismisses rather than moves stock.
 */
export type GroceryItemVariant =
  | "pending"
  | "recent"
  | "settled"
  | "memory"
  | "resolving"
  | "failed";

/**
 * The one variant that animates on its own.
 *
 * A spinner would be the obvious thing and is the wrong one here: it sits *beside* the content and
 * says "the app is busy", where what has to be said is "this card in particular is not real yet".
 * Breathing the card itself says that with no extra element, and it degrades honestly — if the
 * animation never runs, the card is simply dim, which is still truthful.
 */
const PULSE_MS = 900;
const PULSE_MIN_OPACITY = 0.45;

type Props = {
  name: string;
  quantity?: string;
  /** Stand-in for the produce photo until real ones exist. */
  emoji: string;
  imageUrl?: string;
  /**
   * A picture that shipped with the app, where `imageUrl` is one the backend resolved.
   *
   * Two props rather than one widened `imageUrl` because they are two different things: a bundled
   * asset is a module handle, a URL is a string that may 404, and the ingredient rows that use the
   * second have nothing to do with the appliance tiles that use the first. Collapsing them would
   * leave a prop whose name is a lie in half its call sites.
   */
  imageSrc?: ImageProps["source"];
  markerSrc?: string;
  variant?: GroceryItemVariant | "ghost";
  /**
   * A small clock beside the quantity: this is close to going off. Deliberately nothing more — no
   * date, no number, no tap of its own. The date behind it is a rough estimate, and the card hints
   * at it rather than rushing anyone. Drawn only where the card has a quantity line.
   */
  expiresSoon?: boolean;
  width?: number;
  onPress?: () => void;
  /** Left unset, a long press does nothing, not even the haptic: there is nothing to feel for. */
  onLongPress?: () => void;
  style?: ViewStyle;
};

/**
 * Breathes while `active`, and holds still otherwise.
 *
 * The shared value is driven from an effect rather than set during render because a card can
 * change variant while mounted — a ghost that fails stops breathing without remounting — and
 * cancelling the repeat is the only way to leave it at full opacity instead of wherever the
 * animation happened to be.
 */
const usePulse = (active: boolean) => {
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (!active) {
      cancelAnimation(opacity);
      opacity.value = withTiming(1, { duration: PULSE_MS / 4 });
      return;
    }

    opacity.value = withRepeat(
      withTiming(PULSE_MIN_OPACITY, { duration: PULSE_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );

    return () => cancelAnimation(opacity);
  }, [active, opacity]);

  return useAnimatedStyle(() => ({ opacity: opacity.value }));
};

export const GroceryItem = ({ name, quantity, emoji, markerSrc, imageUrl, imageSrc, variant = "pending", expiresSoon, width, onPress, onLongPress, style }: Props) => {
  /** Off, the card neither flies, fades nor breathes: it is drawn where and how it ends up. */
  const isMotionAllowed = useIsMotionAllowed();
  const pulse = usePulse(isMotionAllowed && variant === "resolving");

  /** A bundled picture wins over a fetched one, and either wins over the glyph standing in. */
  const picture = imageSrc ?? (imageUrl ? { uri: imageUrl } : undefined);

  // Indexing first and concatenating after renders the string "undefined" for an empty name —
  // `undefined + ""`. A card with no name is a card with no name, not a card announcing one.
  const title = name ? name[0]!.toUpperCase() + name.slice(1) : name;

  return (
    <Animated.View
      layout={isMotionAllowed ? ITEM_TRANSITION : undefined}
      entering={isMotionAllowed ? ITEM_ENTERING : undefined}
      exiting={isMotionAllowed ? ITEM_EXITING : undefined}
      style={[{ width }, pulse]}>
      <Pressable
        intensity={0.95}
        onPress={() => {
          void Haptics.selectionAsync();
          onPress?.();
        }}
        onLongPress={onLongPress}
        style={{
          ...styles.container,
          ...styles[variant],
          ...(quantity ? {} : styles.gapLarge),
          ...style
        }}
      >
        {picture && <Image
          source={picture}
          style={styles.icon}
          contentFit="contain"
        />}
        {!picture && <Text.H4 style={styles.emoji}>{emoji}</Text.H4>}
        <Text.Base
          color={theme.colors.muted}
          numberOfLines={2}
          style={{ textAlign: "center", textBalance: true }}
        >
          {title}
        </Text.Base>
        {(quantity || markerSrc) && <View style={styles.quantity}>
          {expiresSoon && <ClockAlertIcon
            size={12}
            color={theme.colors.danger.base}
          />}
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
            style={{
              ...variant === "ghost" ? styles.quantityBadge : undefined,
              textAlign: "center",
            }}
          >
            {quantity}
          </Text.Sm>
        </View>}
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
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
  gapLarge: {
    gap: theme.spacing[8]
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
  /**
   * Being worked out: the open outline of something missing, because that is what it will become.
   * Nothing here says "error" — the card is on its way, and the breathing is what says it is not
   * there yet.
   */
  resolving: {
    borderColor: theme.colors.neutral.subtle,
    backgroundColor: "transparent",
  },
  /**
   * Refused, or never answered. The one card whose tap takes it away rather than moving stock, so
   * it is drawn as the odd one out: a closed danger outline, where every other unfinished thing on
   * this list is dashed and open.
   */
  failed: {
    borderStyle: "solid",
    borderWidth: 2,
    borderColor: theme.colors.danger.elevated,
    backgroundColor: theme.colors.danger.subtle,
  },
  /** Overrides the H4 metrics — an emoji needs the room a heading does not. */
  emoji: {
    fontSize: 40,
    lineHeight: 48,
    minWidth: 48,
    textAlign: "center",
  },
  icon: {
    width: 48,
    height: 48,
  },
  quantity: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[6],
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
