import { View, StyleSheet, ViewStyle } from "react-native";
import { Text } from "@ui/text";
import { Check, Icon, MorphIcon } from "./icons";
import { Pressable } from "./pressable";
import { theme } from "theme";

type Props = {
  style?: ViewStyle,
  label?: string,
  items: {
    value: string,
    label: string,
    icon?: Icon | string,
    selected?: boolean,
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
export const GroupSelect = ({ style, items, label, onSelect }: Props) => {
  return (
    <View style={[styles.container, style]}>
      {label && <Text.Lg>{label}</Text.Lg>}
      <View style={styles.buttonsGrid}>
        {items.map((item) => {
          const icon = item.selected ? Check : item.icon;
          const textColor = item.selected ? SELECTED_TEXT : theme.colors.neutral.base;
          const iconColor = item.selected ? SELECTED_TEXT : theme.colors.neutral.elevated;

          const textIcon = typeof icon === "string" ? (
            <Text.Base color={iconColor}>
              {icon}
            </Text.Base>
          ) : undefined;

          return (
            <Pressable
              key={item.value}
              onPress={() => onSelect(item.value)}
              style={[styles.button, item.selected && styles.buttonSelected]}
            >
              {textIcon}
              {(icon && !textIcon) && <MorphIcon
                icon={icon}
                size={16}
                color={iconColor}
              />}
              <Text.Base color={textColor}>
                {item.label}
              </Text.Base>
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
  }
})
