import { StyleSheet, View, type ViewStyle } from "react-native";

import { ArrowRightIcon } from "@ui/icons";
import { Image } from "@ui/image";
import { Text } from "@ui/text";
import { theme } from "theme";

/** Large enough to recognise the produce at a glance, small enough for a row to stay one line. */
const PICTURE_SIZE = 36;

export type SubstitutionSide = {
  name: string;
  /** Stands in when there is no picture. */
  emoji: string;
  imageUrl?: string;
};

type Props = {
  /** One row per ingredient replaced, in the order given. */
  swaps: { key: string; from: SubstitutionSide; to: SubstitutionSide }[];
  style?: ViewStyle;
};

/**
 * How hard each side gives way when a row is too long. The ingredient going out shrinks twice as
 * hard: the one coming in is what the cook has to fetch, so its name is the one worth reading whole.
 * Yoga weighs this by width too, so at equal widths the left gives up exactly twice as much.
 */
const SHRINK = { from: 2, to: 1 } as const;

const _Side = ({ name, emoji, imageUrl, shrink }: SubstitutionSide & { shrink: number }) => (
  <View style={[styles.side, { flexShrink: shrink }]}>
    {imageUrl ? (
      <Image source={{ uri: imageUrl }} style={styles.picture} contentFit="contain" />
    ) : (
      <Text.H4 style={styles.emoji}>{emoji}</Text.H4>
    )}
    <Text.Base numberOfLines={1} style={styles.name}>
      {name}
    </Text.Base>
  </View>
);

/**
 * Ingredient swaps, one per row: what goes out on the left, what comes in on the right.
 *
 * Every side is drawn the same way whatever it is, picture first and the emoji standing in when
 * there is none, so a row reads as "this becomes that" before a word of it is read.
 */
export const CardSubstitutions = ({ swaps, style }: Props) => (
  <View style={[styles.container, style]}>
    {swaps.map(({ key, from, to }, index) => (
      <View key={key} style={[styles.row, index > 0 && { marginTop: theme.spacing[12] }]}>
        <_Side {...from} shrink={SHRINK.from} />
        <ArrowRightIcon size={18} color={theme.colors.muted} />
        <_Side {...to} shrink={SHRINK.to} />
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  container: {
    borderRadius: theme.radius.md,
    marginTop: theme.spacing[4],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
    flexShrink: 1,
  },
  /**
   * As wide as its content, never wider: growing would split the row's free space equally, which
   * with short names makes both sides look the same size. Past the row's width, both sides give
   * some back, weighted by `SHRINK`, and the name truncates.
   */
  side: {
    flexGrow: 0,
    flexBasis: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[4],
    padding: theme.spacing[8],
    paddingLeft: theme.spacing[4],
    paddingRight: 0,
    borderRadius: theme.radius.sm,
    borderColor: theme.colors.neutral.subtle,
    borderWidth: 2,
    borderStyle: "dashed",
    backgroundColor: theme.colors.surface.elevatedSubtle,
  },
  picture: {
    width: PICTURE_SIZE,
    height: PICTURE_SIZE,
  },
  emoji: {
    width: PICTURE_SIZE,
    textAlign: "center",
  },
  /** Shrinks to truncate, never grows: a zero basis here would hide its width from the side. */
  name: {
    flexShrink: 1,
    paddingRight: theme.spacing[4],
  },
});
