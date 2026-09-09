import { StyleSheet, View, ViewStyle } from "react-native";

import { CheckIcon } from "@ui/icons";
import { Image, ImageProps } from "@ui/image";
import { Pressable } from "@ui/pressable";
import { Text } from "@ui/text";
import { colors, theme } from "theme";
import { LinearGradient } from "expo-linear-gradient";
import { ComponentProps, ReactNode } from "react";

/**
 * What a picked tile is filled with, and what an unpicked one looks like beside it.
 *
 * `primary` is a preference being switched on — the tunnel's kitchen and diet grids, where orange
 * is the app saying "yes, that one". `neutral` is a tile that is already the case: the dish
 * currently on the plate in the swap sheet. Orange there would read as a choice being made, when
 * the state it marks is the one the user is deciding whether to leave alone — so it takes the dark
 * chrome fill instead, and its unpicked neighbours are outlines, the same invitation an empty
 * plate draws.
 */
type Tone = "primary" | "neutral";

const TONES = {
  primary: {
    gradient: [colors.primary.base, colors.primary.elevated],
    foreground: colors.primary.foreground,
    tick: colors.primary.subtle,
  },
  neutral: {
    gradient: [colors.neutral.base, colors.neutral.muted],
    foreground: colors.neutral.foreground,
    tick: colors.neutral.elevated,
  },
} as const satisfies Record<Tone, { gradient: readonly [string, string]; foreground: string; tick: string }>;

type Props = {
  label: string;
  imageSrc?: ImageProps["source"];
  /**
   * Drawn in the picture's place when there is no picture — the tunnel's kitchen grid, where the
   * thing being tiled is a vocabulary value rather than something that was photographed.
   *
   * `imageSrc` wins when both are given: a real picture is always the better tile, and the glyph is
   * what a value falls back to rather than a decoration sitting beside one.
   */
  emoji?: string;
  selected?: boolean;
  tone?: Tone;
  /**
   * Drawn under the label — a status pill, or the confirmation that this tile is the current one.
   *
   * A node rather than a string because what belongs there is a `Badge`, and `src/ui/**` cannot
   * translate its own copy (ADR 0002). The caller composes it; the tile only makes room.
   */
  badge?: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  imageStyle?: ComponentProps<typeof Image>["style"];
  elevated?: boolean;
};

const IMAGE_HEIGHT = 96;

/**
 * A picture (or a glyph) and a word, picked or not — the tile the tunnel's grids are built from.
 *
 * Selection is carried by the whole tile rather than by a checkbox in its corner: these grids are
 * answered at a glance and with a thumb, and a tile that fills is readable at arm's length where a
 * tick is not. The tick stays as confirmation, not as the signal.
 */
export const CardChoice = ({
  label,
  imageSrc,
  emoji,
  selected = false,
  tone = "primary",
  elevated = false,
  badge,
  onPress,
  imageStyle,
  style,
}: Props) => {
  const { gradient, foreground, tick } = TONES[tone];

  return (
    <Pressable
      intensity={0.96}
      onPress={onPress}
      style={{
        ...styles.container,
        ...(tone === "neutral" ? styles.resting : null),
        ...(selected ? styles.selected : null),
        ...styles.borderRadius,
        ...(elevated ? styles.shadow : null),
        ...style,
      }}
    >
      {selected && <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 1 }}
        end={{ x: 0, y: 0 }}
        style={[
          StyleSheet.absoluteFill,
          styles.borderRadius,
        ]}
      />}
      {!imageSrc && emoji ? (
        <View style={[styles.image, styles.emojiBox]}>
          <Text.H4 style={styles.emoji}>{emoji}</Text.H4>
        </View>
      ) : (
        <Image source={imageSrc} contentFit="contain" style={[styles.image, imageStyle]} />
      )}
      <View style={styles.labelRow}>
        <Text.Base
          color={selected ? foreground : colors.muted}
          weight={selected ? 700 : 500}
          numberOfLines={1}
          style={{ flexShrink: 1 }}
        >
          {label}
        </Text.Base>
        {selected && <CheckIcon size={14} color={tick} style={{ marginTop: 1 }} strokeWidth={3} />}
      </View>
      {badge}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 2,
    borderColor: colors.border.default,
    backgroundColor: colors.surface.elevated,
    padding: theme.spacing[8],
    paddingBottom: theme.spacing[12],
    gap: theme.spacing[8],
    alignItems: "center",
    overflow: "hidden",
  },
  shadow: {
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 4,
        blurRadius: 32,
        spreadDistance: 0,
        color: "rgba(0, 0, 0, 0.07)",
      },
    ],
  },
  /** An unpicked neutral tile is an outline: nothing has been put in it yet to give it a surface. */
  resting: {
    borderStyle: "dashed",
    borderColor: colors.neutral.elevated,
    backgroundColor: "transparent",
  },
  selected: {
    backgroundColor: "transparent",
    borderStyle: "solid",
    borderColor: colors.border.medium
  },
  borderRadius: {
    borderRadius: theme.radius.md,
  },
  image: {
    width: "100%",
    height: IMAGE_HEIGHT,
  },
  emojiBox: {
    alignItems: "center",
    justifyContent: "center",
  },
  /** Overrides the H4 metrics — an emoji standing in for a picture needs the room a heading does not. */
  emoji: {
    fontSize: 44,
    lineHeight: 52,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[8],
    maxWidth: "100%"
  },
});
