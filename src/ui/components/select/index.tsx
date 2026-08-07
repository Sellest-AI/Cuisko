import { useRef, useState } from "react";
import {
  Modal,
  Pressable as NativePressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { colors, theme } from "theme";
import { CheckIcon, ChevronDown, ChevronUp } from "../icons";
import { Pressable } from "../pressable";
import { Text } from "../text";
import type { SelectProps } from "./types";
import { Button } from "../button";

/**
 * The shared select — Android and web.
 *
 * iOS resolves to `select/index.ios.tsx` instead and gets the real system menu. Android deliberately
 * lands here rather than on Jetpack Compose's `DropdownMenu`: Material 3 would drag stock Android
 * chrome into a warm, heavily-branded surface, and the popover it draws is the one place the
 * design *wants* our own tokens. Sharing the fallback also means one implementation to keep
 * honest instead of two.
 *
 * There is no blur here on purpose. `surface.elevated` is translucent and assumes something
 * frosted behind it; a Modal has nothing behind it to sample, and Android's blur is not worth
 * what it costs. So the sheet is opaque `background` separated by shadow, which reads the same
 * on both platforms.
 */
export const Select = <T extends string>({
  options,
  value,
  onChange,
  placeholder,
  disabled,
  style,
}: SelectProps<T>) => {
  const triggerRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const { height: windowHeight } = useWindowDimensions();

  const selected = options.find((option) => option.value === value);
  const isOpen = anchor !== null;

  /**
   * The popover renders inside a Modal, so it needs the trigger's *window* coordinates rather
   * than its place in the tree: positioned absolutely in situ it would be clipped by the first
   * ancestor with `overflow: hidden`, which in this design is every card and every sheet.
   */
  const open = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) =>
      setAnchor({ x, y, width, height }),
    );
  };

  const close = () => setAnchor(null);

  /** Flip above the trigger only when below genuinely cannot hold the list and above can. */
  const spaceBelow = anchor ? windowHeight - (anchor.y + anchor.height) : 0;
  const dropsUp = anchor !== null && spaceBelow < MAX_HEIGHT && anchor.y > spaceBelow;

  return (
    <>
      <View ref={triggerRef} collapsable={false} style={style}>
        <Button
          variant="neutral"
          disabled={disabled}
          onPress={open}
          rightIcon={isOpen ? ChevronUp : ChevronDown}
        >
          {selected?.label ?? placeholder ?? ""}
        </Button>
      </View>

      <Modal visible={isOpen} transparent animationType="none" onRequestClose={close}>
        <NativePressable style={StyleSheet.absoluteFill} onPress={close} />
        {anchor && (
          <Animated.View
            entering={(dropsUp ? FadeInUp : FadeInDown).duration(ENTER_MS)}
            style={[
              styles.popover,
              {
                left: anchor.x,
                minWidth: Math.max(anchor.width, MIN_WIDTH),
                ...(dropsUp
                  ? { bottom: windowHeight - anchor.y + theme.spacing[8] }
                  : { top: anchor.y + anchor.height + theme.spacing[8] }),
              },
            ]}
          >
            <ScrollView bounces={false} style={{ maxHeight: MAX_HEIGHT }}>
              {options.map((option) => (
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
              ))}
            </ScrollView>
          </Animated.View>
        )}
      </Modal>
    </>
  );
};

/** Where the trigger sits in the window, measured at open time. */
type Anchor = { x: number; y: number; width: number; height: number };

/**
 * Off the spacing scale on purpose: these size the popover itself and its glyphs, rather than
 * setting padding rhythm inside it.
 */
const MAX_HEIGHT = 280;
const MIN_WIDTH = 160;
const CHEVRON_SIZE = 16;
const CHECK_SIZE = 16;
const CHECK_STROKE = 3;
const ENTER_MS = 160;

const styles = StyleSheet.create({
  popover: {
    position: "absolute",
    backgroundColor: colors.background,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.border.medium,
    paddingVertical: theme.spacing[4],
    overflow: "hidden",
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 8,
        blurRadius: 24,
        spreadDistance: 0,
        color: "rgba(0, 0, 0, 0.12)",
      },
    ],
  },
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
