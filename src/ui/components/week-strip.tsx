import { StyleSheet, View, ViewStyle } from "react-native";

import { theme } from "theme";

import { DayMarker } from "./day-marker";

export type WeekDay = {
  date: Date;
  /** How far the plan for that day has got — see `DayMarker`. */
  status: "complete" | "pending" | "empty";
};

type Props<T extends WeekDay> = {
  days: T[];
  /**
   * Index of the day drawn as selected. An index rather than a `Date` so a screen showing the
   * strip beside a `PlateCarousel` holds one kind of selection for both, and comparing days is
   * the caller's job either way.
   */
  selectedIndex?: number;
  onSelect?: (day: T) => void;
  /** BCP 47 tag for the weekday initials — see `DayMarker`. */
  locale?: string;
  style?: ViewStyle;
};

/** The oldest day is half-faded: the week runs off the edge rather than starting there. */
const EDGE_OPACITY = 0.5;

/**
 * A row of day markers spanning the width — the week at a glance, one tap to move through it.
 */
export const WeekStrip = <T extends WeekDay>({
  days,
  selectedIndex,
  onSelect,
  locale,
  style,
}: Props<T>) => (
  <View style={[styles.container, style]}>
    {days.map((day, index) => (
      <DayMarker
        key={day.date.toDateString()}
        date={day.date}
        status={day.status}
        locale={locale}
        selected={index === selectedIndex}
        onPress={onSelect ? () => onSelect(day) : undefined}
        style={index === 0 ? styles.edge : undefined}
      />
    ))}
  </View>
);

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing[16],
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  edge: { opacity: EDGE_OPACITY },
});
