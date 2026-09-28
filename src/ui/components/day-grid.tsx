import { StyleSheet, View } from "react-native";

import { CardChoice } from "@ui/cards/choice";
import type { ImageProps } from "@ui/image";
import { Text } from "@ui/text";
import { theme } from "theme";

/**
 * What a tile needs: its day, and the dish already on it if there is one. Structural, so the
 * planning sheet's kept plates and the onboarding's fixtures both satisfy it (ADR 0002).
 */
export type DayGridDay = {
  date: Date;
  meal?: { title: string; imageSrc?: ImageProps["source"] };
};

const COLUMNS = 3;
const GAP = theme.spacing[8];
const TILE_IMAGE_HEIGHT = 128;

/** Generic in the day, so `onChoose` hands the caller back its own type, not the narrowed one. */
type Props<D extends DayGridDay> = {
  days: readonly D[];
  /** The picture of a plate with nothing on it: the caller's, so this file owns no asset. */
  emptyPlate: ImageProps["source"];
  /** The word under a tile with no dish on it. */
  emptyLabel: string;
  dayLabel: (date: Date) => string;
  onChoose: (day: D) => void;
};

/**
 * Nine days, three across, each showing the dish already on it at the chosen slot or an empty
 * plate — so the tile a cook is about to tap says what the tap will replace.
 *
 * Padding on each tile rather than `gap` on the row: three tiles at a third of the width plus two
 * gaps is wider than the row, and the third tile wraps. A tile that pads itself stays a third.
 */
export const DayGrid = <D extends DayGridDay>({
  days,
  emptyPlate,
  emptyLabel,
  dayLabel,
  onChoose,
}: Props<D>) => (
  <View style={styles.grid}>
    {days.map((day) => (
      <View key={day.date.getTime()} style={styles.tile}>
        <CardChoice
          tone="neutral"
          label={dayLabel(day.date)}
          imageSrc={day.meal?.imageSrc ?? emptyPlate}
          imageStyle={{ height: TILE_IMAGE_HEIGHT }}
          onPress={() => onChoose(day)}
          style={styles.card}
          badge={
            <Text.Sm numberOfLines={1} color={theme.colors.neutral.muted}>
              {day.meal?.title ?? emptyLabel}
            </Text.Sm>
          }
        />
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -GAP / 2,
  },
  tile: {
    width: `${100 / COLUMNS}%`,
    padding: GAP / 2,
  },
  card: {
    width: "100%",
    paddingHorizontal: theme.spacing[16],
    height: TILE_IMAGE_HEIGHT + 32
  },
});
