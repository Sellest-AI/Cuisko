import { StyleSheet, View, ViewStyle } from "react-native";

import { CheckIcon } from "@ui/icons";
import { Pressable } from "@ui/pressable";
import { Text } from "@ui/text";
import { colors, theme } from "theme";

type Option<T extends string> = { id: T; label: string };

type Props<T extends string> = {
  /** Drawn in the order given — the row is short enough that order is the whole hierarchy. */
  options: readonly Option<T>[];
  selected: readonly T[];
  onToggle: (id: T) => void;
  style?: ViewStyle;
};

const TRACK_HEIGHT = 48;

/**
 * A row of segments, each independently on or off.
 *
 * Multi-select, unlike the platform segmented control it borrows its shape from: picking two of
 * two is the common answer here, so "both" and "just one" have to be the same gesture. That also
 * rules out a checkbox — the same reason `CardChoice` carries selection in the whole tile. A tick
 * in a corner is a desktop idiom, readable at a mouse's distance and not at a thumb's.
 *
 * Two to four options. Past that the labels stop fitting in equal segments and the answer wants a
 * grid of tiles instead.
 */
export const ToggleRow = <T extends string>({ options, selected, onToggle, style }: Props<T>) => (
  <View style={[styles.track, style]}>
    {options.map((option) => {
      const isSelected = selected.includes(option.id);

      return (
        <Pressable
          key={option.id}
          intensity={0.97}
          onPress={() => onToggle(option.id)}
          style={[
            styles.segment,
            isSelected && styles.selected,
            !isSelected && styles.elevated,
          ]}
        >
          {isSelected && <View style={{
            width: 20,
            height: 20,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: theme.radius.full,
            backgroundColor: colors.primary.base,
          }}>
            <CheckIcon
              size={12}
              color={colors.primary.subtle}
              style={{ position: "relative", marginTop: 1 }}
              strokeWidth={3}
            />
          </View>}
          <Text.Base
            color={isSelected ? colors.primary.base : colors.muted}
            weight={isSelected ? 700 : 600}
            numberOfLines={1}
          >
            {option.label}
          </Text.Base>
        </Pressable>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[4],
    height: TRACK_HEIGHT,
    padding: theme.spacing[4],
    borderRadius: theme.radius.full,
    backgroundColor: colors.surface.elevatedSubtle,
    borderWidth: 2,
    borderColor: colors.border.default,
  },
  elevated: {
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 6,
        blurRadius: 24,
        spreadDistance: 0,
        color: "rgba(0, 0, 0, 0.07)",
      },
    ],
  },
  segment: {
    flex: 1,
    height: TRACK_HEIGHT - theme.spacing[8],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[8],
    borderRadius: theme.radius.full,
  },
  selected: {
    borderWidth: 2,
    borderColor: colors.primary.elevated,
    backgroundColor: colors.primary.subtle,
  },
});
