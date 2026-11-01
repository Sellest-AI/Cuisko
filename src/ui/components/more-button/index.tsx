import { Fragment } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { colors, theme } from "theme";
import { ButtonIcon } from "../button-icon";
import { Ellipsis, EllipsisVertical, MorphIcon } from "../icons";
import { Popover } from "../popover";
import { Pressable } from "../pressable";
import { Text } from "../text";
import type { MoreButtonProps } from "./types";

/**
 * The shared more button — Android and web. iOS resolves to `more-button/index.ios.tsx` and gets
 * the system pull-down menu.
 *
 * The trigger follows each platform's own glyph: Android's overflow menu is `⋮`, the web's `…`.
 */
export const MoreButton = ({
  groups,
  accessibilityLabel,
  size,
  disabled,
  style,
}: MoreButtonProps) => (
  <Popover
    style={style}
    minWidth={MIN_WIDTH}
    trigger={(open) => (
      <ButtonIcon
        variant="neutral"
        size={size}
        disabled={disabled}
        onPress={open}
        accessibilityLabel={accessibilityLabel}
      >
        {Platform.OS === "android" ? EllipsisVertical : Ellipsis}
      </ButtonIcon>
    )}
  >
    {(close) =>
      groups.map((group, index) => (
        <Fragment key={group.map((action) => action.key).join("|")}>
          {index > 0 && <View style={styles.separator} />}
          {group.map((action) => {
            const color = action.disabled
              ? colors.neutral.muted
              : action.destructive
                ? colors.danger.base
                : colors.foreground;

            return (
              <Pressable
                key={action.key}
                disabled={action.disabled}
                style={styles.row}
                onPress={() => close(action.onPress)}
              >
                {action.icon && <MorphIcon icon={action.icon} size={ICON_SIZE} color={color} />}
                <Text.Base numberOfLines={1} weight={500} color={color}>
                  {action.label}
                </Text.Base>
              </Pressable>
            );
          })}
        </Fragment>
      ))
    }
  </Popover>
);

/** Off the spacing scale on purpose: these size the popover and its glyphs. */
const MIN_WIDTH = 200;
const ICON_SIZE = 18;

const styles = StyleSheet.create({
  row: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[12],
    paddingHorizontal: theme.spacing[16],
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginVertical: theme.spacing[4],
    backgroundColor: colors.border.default,
  },
});
