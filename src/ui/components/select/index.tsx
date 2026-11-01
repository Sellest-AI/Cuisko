import { StyleSheet } from "react-native";
import { colors, theme } from "theme";
import { CheckIcon, ChevronDown, ChevronUp } from "../icons";
import { Pressable } from "../pressable";
import { Text } from "../text";
import type { SelectProps } from "./types";
import { Button } from "../button";
import { Popover } from "../popover";

/**
 * The shared select — Android and web.
 *
 * iOS resolves to `select/index.ios.tsx` instead and gets the real system menu. Android deliberately
 * lands here rather than on Jetpack Compose's `DropdownMenu`: Material 3 would drag stock Android
 * chrome into a warm, heavily-branded surface, and the popover it draws is the one place the
 * design *wants* our own tokens. Sharing the fallback also means one implementation to keep
 * honest instead of two.
 */
export const Select = <T extends string>({
  options,
  value,
  onChange,
  placeholder,
  disabled,
  style,
}: SelectProps<T>) => {
  const selected = options.find((option) => option.value === value);

  return (
    <Popover
      style={style}
      trigger={(open, isOpen) => (
        <Button
          style={{
            backgroundColor: colors.background,
            paddingLeft: theme.spacing[12],
            paddingRight: theme.spacing[8],
            gap: theme.spacing[6],
            minHeight: 28
          }}
          variant="neutral"
          disabled={disabled}
          onPress={open}
          rightIcon={isOpen ? ChevronUp : ChevronDown}
        >
          {selected?.label ?? placeholder ?? ""}
        </Button>
      )}
    >
      {(close) =>
        options.map((option) => (
          <Pressable
            key={option.value}
            disabled={option.disabled}
            style={styles.row}
            onPress={() => {
              onChange(option.value);
              close();
            }}
          >
            <Text.Base
              numberOfLines={1}
              weight={option.value === value ? 600 : 500}
              color={option.disabled ? colors.neutral.muted : colors.foreground}
            >
              {option.label}
            </Text.Base>
            {option.value === value && (
              <CheckIcon
                size={CHECK_SIZE}
                strokeWidth={CHECK_STROKE}
                color={colors.secondary.base}
              />
            )}
          </Pressable>
        ))
      }
    </Popover>
  );
};

/** Off the spacing scale on purpose: these size the glyph, not the rhythm around it. */
const CHECK_SIZE = 16;
const CHECK_STROKE = 3;

const styles = StyleSheet.create({
  row: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[12],
    paddingHorizontal: theme.spacing[16],
  },
});
