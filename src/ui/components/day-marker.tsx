import { StyleSheet, View, ViewStyle } from "react-native";
import Animated from "react-native-reanimated";

import { useSpin } from "@ui/hooks/useSpin";
import { colors, theme } from "theme";

import { Check, CircleDashed, MorphIcon } from "./icons";
import { Text } from "./text";
import { Pressable } from "./pressable";

type Props = {
  status: "complete" | "pending" | "empty";
  date: Date;
  /**
   * BCP 47 tag for the weekday initial. Defaults to the product's language rather than the
   * device's: `src/ui/**` may not read the device locale (ADR 0002), and which language Cuisko
   * speaks is a product decision, not the phone's. Pass it explicitly to override.
   */
  locale?: string;
  style?: ViewStyle;
  onPress?: () => void;
  selected?: boolean;
};

const _statusColors = (selected: boolean) => ({
  empty: {
    borderWidth: 2,
    borderColor: colors.transparent.light,
    backgroundColor: selected ? colors.neutral.elevated : colors.neutral.subtle,
    icon: selected ? { backgroundColor: colors.neutral.subtle, color: colors.neutral.muted }
      : { backgroundColor: colors.neutral.elevated, color: colors.neutral.muted },
    day: colors.neutral.muted,
    date: colors.neutral.base,
  },
  pending: {
    borderWidth: 2,
    borderColor: colors.transparent.light,
    backgroundColor: selected ? colors.primary.subtle : colors.neutral.subtle,
    icon: { backgroundColor: colors.primary.base, color: colors.primary.subtle },
    day: colors.primary.base,
    date: colors.primary.base,
  },
  complete: {
    borderWidth: 2,
    borderColor: selected ? colors.transparent.light : colors.border.default,
    backgroundColor: selected ? colors.secondary.subtle : colors.surface.elevatedSubtle,
    icon: selected ? { backgroundColor: colors.success.elevated, color: colors.success.foreground } :
      { backgroundColor: colors.success.subtle, color: colors.success.base },
    day: selected ? colors.success.elevated : colors.neutral.muted,
    date: selected ? colors.success.elevated : colors.neutral.base,
  },
}) as const;

/** Both variants built once at module load rather than on every render: a week strip is seven
 *  markers re-deriving three nested objects each, and none of it varies at runtime. */
const STATUS_COLORS = {
  default: _statusColors(false),
  selected: _statusColors(true),
} as const;

const DEFAULT_LOCALE = "en-US";

/**
 * Building an `Intl.DateTimeFormat` costs far more than formatting one letter with it, and a week
 * strip mounts seven markers at once. One formatter per locale, built on first use and reused.
 */
const WEEKDAY_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

/**
 * `weekday: "narrow"` is the ICU field that means "the initial" — slicing the short form would
 * reimplement it badly. Note that narrow French collides on M for mardi and mercredi; that is
 * standard CLDR output, not a bug here.
 */
const weekdayInitial = (date: Date, locale: string) => {
  let formatter = WEEKDAY_FORMATTERS.get(locale);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
    WEEKDAY_FORMATTERS.set(locale, formatter);
  }

  return formatter.format(date);
};

/** Slow enough to read as "still waiting" rather than "loading right now". */
const PENDING_REVOLUTION_MS = 4000;

const ICON_SIZE = 12;

/**
 * Off the spacing scale deliberately: the chip's proportions are tuned to its icon rather than to
 * page rhythm, and snapping them to `theme.spacing` visibly distorts the circle.
 */
const CHIP_PADDING = 4;
const NUMBER_GAP = 6;

/**
 * One day in the week strip: its initial, its number, and how far the plan for it has got.
 *
 * `pending` is the only status that turns — a settled day should be still, or a week of markers
 * never stops moving.
 */
export const DayMarker = ({ status, date, locale = DEFAULT_LOCALE, style, onPress, selected = false }: Props) => {
  const color = STATUS_COLORS[selected ? "selected" : "default"][status];
  const day = weekdayInitial(date, locale);
  // Local time on purpose — "Tuesday" has to mean the user's Tuesday, not UTC's.
  const dayNumber = date.getDate();
  const icon = status === "complete" ? Check : CircleDashed;
  const spin = useSpin(status === "pending", { revolutionMs: PENDING_REVOLUTION_MS });

  const Component = onPress ? Pressable : View;

  return (
    <Component
      intensity={0.85}
      onPress={onPress}
      style={[
        styles.container,
        {
          backgroundColor: color.backgroundColor,
          borderWidth: color.borderWidth,
          borderColor: color.borderColor
        },
        style,
      ]}
    >
      <Text.Sm color={color.day} style={styles.day}>
        {day}
      </Text.Sm>
      <Text.Base color={color.date} style={styles.dayNumber}>
        {dayNumber}
      </Text.Base>
      <Animated.View style={[styles.icon, spin, { backgroundColor: color.icon.backgroundColor }]}>
        <MorphIcon icon={icon} size={ICON_SIZE} color={color.icon.color} />
      </Animated.View>
    </Component>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: CHIP_PADDING,
    borderRadius: theme.radius.full,
    borderColor: colors.border.default,
    alignSelf: "flex-start",
    justifyContent: "center",
    alignItems: "center",
  },
  day: { marginBottom: theme.spacing[2], textAlign: "center" },
  dayNumber: { marginBottom: NUMBER_GAP, textAlign: "center" },
  icon: {
    borderRadius: theme.radius.full,
    padding: theme.spacing[4],
  },
});
