import { StyleSheet, View, ViewStyle } from "react-native";

import { colors, theme } from "theme";

import { DayMarker } from "./day-marker";
import { Pressable } from "./pressable";
import { PlusIcon, type Icon } from "./icons";

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
  onAdd?: () => void;
  /** Overrides every marker's status icon — see `DayMarker`. */
  icon?: Icon;
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
  onAdd,
  icon,
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
        icon={icon}
        selected={index === selectedIndex}
        onPress={onSelect ? () => onSelect(day) : undefined}
        style={index === 0 ? styles.edge : undefined}
      />
    ))}
    {onAdd && (
      <Pressable
        key="add"
        onPress={onAdd}
        style={styles.add}
      >
        <PlusIcon size={18} color={colors.neutral.base} />
      </Pressable>
    )}
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
  add: {
    paddingHorizontal: theme.spacing[8],
    padding: theme.spacing[4],
    borderRadius: theme.radius.full,
    alignSelf: "stretch",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.neutral.elevated,
    height: 70,
  }
});
