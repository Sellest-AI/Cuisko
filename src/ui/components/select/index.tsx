import { useRef, useState } from "react";
import {
  Modal,
  Pressable as NativePressable,
  Platform,
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
import { BlurView } from "../blur-view";

/**
 * The shared select — Android and web.
 *
 * iOS resolves to `select/index.ios.tsx` instead and gets the real system menu. Android deliberately
 * lands here rather than on Jetpack Compose's `DropdownMenu`: Material 3 would drag stock Android
 * chrome into a warm, heavily-branded surface, and the popover it draws is the one place the
 * design *wants* our own tokens. Sharing the fallback also means one implementation to keep
 * honest instead of two.
 *
 * On Android the sheet is opaque `background`, separated from the page by its shadow.
 * `surface.elevated` is translucent and assumes something frosted behind it; a Modal has nothing
 * behind it to sample there, and giving the popover a surface of its own to sample is not worth
 * what it costs. Web keeps the translucent surface, which its `backdrop-filter` can honour.
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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

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

  /**
   * Centred on the trigger, then clamped into the window. Centring has to be computed from the
   * width the popover actually renders at rather than from the trigger's: a trigger narrower than
   * `MIN_WIDTH` gets a popover wider than itself, and offsetting by half the *trigger* leaves it
   * off-centre by half the difference. The clamp is what a trigger near either edge needs — the
   * centred position resolves outside the window there, and nothing else would pull it back.
   */
  const popoverWidth = anchor ? Math.max(anchor.width, MIN_WIDTH) : MIN_WIDTH;
  const popoverLeft = anchor
    ? Math.min(
      Math.max(anchor.x + anchor.width / 2 - popoverWidth / 2, MARGIN),
      Math.max(windowWidth - popoverWidth - MARGIN, MARGIN),
    )
    : 0;

  return (
    <>
      <View ref={triggerRef} collapsable={false} style={style}>
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
      </View>

      <Modal visible={isOpen} transparent animationType="none" onRequestClose={close}>
        <NativePressable style={StyleSheet.absoluteFill} onPress={close} />
        {anchor && (
          <Animated.View
            entering={(dropsUp ? FadeInUp : FadeInDown).duration(ENTER_MS)}
            style={[
              styles.popover,
              {
                left: popoverLeft,
                width: popoverWidth,
                ...(dropsUp
                  ? { bottom: windowHeight - anchor.y + theme.spacing[8] }
                  : { top: anchor.y + anchor.height + theme.spacing[8] }),
              },
            ]}
          >
            <BlurView tint="light" style={[styles.popoverContent]}>
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
            </BlurView>
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

/** How close to the window's edge the popover may sit before the clamp pulls it back. */
const MARGIN = theme.spacing[8];
const CHECK_SIZE = 16;
const CHECK_STROKE = 3;
const ENTER_MS = 160;

const styles = StyleSheet.create({
  popover: {
    position: "absolute",
    backgroundColor: Platform.OS === "android" ? colors.background : colors.surface.elevated,
    borderRadius: theme.radius.md,
    borderColor: colors.border.default,
    borderWidth: 2,
    overflow: "hidden",
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 8,
        blurRadius: 24,
        spreadDistance: 0,
        color: "rgba(0, 0, 0, 0.07)",
      },
    ],
  },
  popoverContent: {
    paddingVertical: theme.spacing[4],
    maxHeight: 240
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
