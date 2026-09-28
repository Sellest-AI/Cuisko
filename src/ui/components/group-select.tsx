import { View, StyleSheet, ViewStyle } from "react-native";
import { Text } from "@ui/text";
import { Check, Icon, Lock, MorphIcon } from "./icons";
import { Pressable } from "./pressable";
import { theme } from "theme";

type Props = {
  style?: ViewStyle,
  label?: string,
  /** The label's colour, when the heading should sit quieter than the chips under it. */
  labelColor?: string,
  items: {
    value: string,
    label: string,
    icon?: Icon | string,
    /**
     * A word under the label, for a chip whose meaning depends on where it came from.
     *
     * Structural, like everything else here: the caller decides what it says, and `@ui` never
     * learns that this one happens to carry a constraint's provenance (ADR 0002).
     */
    caption?: string,
    selected?: boolean,
    /**
     * A chip that reads as set but is not the cook's to change — drawn solid, with a lock where a
     * check would be, and never answering a tap. For a value that follows from something else on
     * the same screen: showing it says where it came from, where hiding it reads as a bug.
     */
    locked?: boolean,
  }[]
  /**
   * Which chip was tapped. Required, not optional: selection is drawn from `items[].selected`,
   * so a `GroupSelect` without this renders chips that light up for nobody and answer nothing.
   */
  onSelect: (value: string) => void,
}

/**
 * A wrap of chips, each on or off, with the selection owned by the caller.
 *
 * Stateless on purpose — the answers belong to whatever is collecting them, and a chip row that
 * remembered its own would disagree with the value being saved the moment either changed.
 */
export const GroupSelect = ({ style, items, label, labelColor, onSelect }: Props) => {
  return (
    <View style={[styles.container, style]}>
      {label && <Text.Lg color={labelColor}>{label}</Text.Lg>}
      <View style={styles.buttonsGrid}>
        {items.map((item) => {
          const icon = item.locked ? Lock : item.selected ? Check : item.icon;
          const textColor = item.selected && !item.locked ? SELECTED_TEXT : theme.colors.neutral.base;
          const iconColor = item.selected && !item.locked ? SELECTED_TEXT : theme.colors.neutral.elevated;

          const textIcon = typeof icon === "string" ? (
            <Text.Base color={iconColor}>
              {icon}
            </Text.Base>
          ) : undefined;

          return (
            <Pressable
              key={item.value}
              onPress={() => {
                if (!item.locked) onSelect(item.value);
              }}
              disabled={item.locked}
              haptic
              accessibilityState={{ selected: item.selected || item.locked, disabled: item.locked }}
              style={[
                styles.button,
                item.selected && styles.buttonSelected,
                item.locked && styles.buttonLocked,
              ]}
            >
              {textIcon}
              {(icon && !textIcon) && <MorphIcon
                icon={icon}
                size={16}
                color={iconColor}
              />}
              <View style={styles.chipLabel}>
                <Text.Base color={textColor}>
                  {item.label}
                </Text.Base>
                {item.caption && (
                  <Text.Sm color={theme.colors.neutral.elevated}>
                    {item.caption}
                  </Text.Sm>
                )}
              </View>
            </Pressable>)
        })}
      </View>
    </View>
  )
}

/**
 * Kept out of `styles` for the same reason as `Badge`'s: `color` is a text style, and a view entry
 * carrying one reads as something that paints the chip when it only ever gets read back out.
 */
const SELECTED_TEXT = theme.colors.primary.base;

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing[16],
  },
  buttonsGrid: {
    flexDirection: "row",
    gap: theme.spacing[12],
    flexWrap: "wrap",
  },
  /** A column, so a captioned chip grows downward rather than pushing its neighbours off the row. */
  chipLabel: {
    alignItems: "flex-start",
  },
  button: {
    paddingVertical: theme.spacing[8],
    paddingHorizontal: theme.spacing[12],
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface.elevatedSubtle,
    borderWidth: 2,
    borderColor: theme.colors.neutral.subtle,
    borderStyle: "dashed",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[6],
  },
  buttonSelected: {
    backgroundColor: theme.colors.primary.subtle,
    borderColor: theme.colors.primary.elevated,
    borderStyle: "solid",
  },
  /** Solid like a selected chip, since it IS set — but neutral, so it does not read as the cook's pick. */
  buttonLocked: {
    borderColor: theme.colors.neutral.subtle,
    borderStyle: "solid",
  },
})
