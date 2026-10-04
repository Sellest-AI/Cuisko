import * as Haptics from "expo-haptics";
import { ComponentProps, useEffect, useRef } from "react";
import { Animated, GestureResponderEvent, Pressable as NativePressable, ViewStyle, StyleSheet, ViewProps } from "react-native";

/** How long a press stays locked against a second one. Also the double-tap window. */
const PRESS_LOCK_MS = 300;

type PressableProps = {
  disabled?: boolean;
  animated?: boolean;
  /**
   * A selection tick on every accepted tap. Opt-in, because most presses navigate and the screen
   * changing is feedback enough; this is for a control that stays where it is — a stepper, a chip,
   * a heart. A long press ticks regardless: it has no visible start, so the tick is how the finger
   * learns it landed.
   */
  haptic?: boolean;
  onDoublePress?: (e: GestureResponderEvent) => void;
  children: React.ReactNode;
  intensity?: number;
  style?: ViewProps["style"];
} & ComponentProps<typeof NativePressable>;

export const Pressable = ({ disabled, onPress, children, animated = true, haptic = false, intensity = 0.98, onDoublePress, style: styleProp, ...props }: PressableProps) => {
  // eslint-disable-next-line react-hooks/refs
  const scaleAnim = useRef(new Animated.Value(1)).current;

  /**
   * The re-entrancy lock and the double-tap clock are refs rather than state on purpose: neither
   * is rendered, and as state each press queued two extra renders — and, worse, the unlock landed
   * 300ms later on a component that had usually navigated away by then.
   */
  const isLocked = useRef(false);
  const unlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPress = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (unlockTimer.current) clearTimeout(unlockTimer.current);
    },
    [],
  );

  const lockPress = () => {
    isLocked.current = true;
    if (unlockTimer.current) clearTimeout(unlockTimer.current);
    unlockTimer.current = setTimeout(() => {
      isLocked.current = false;
    }, PRESS_LOCK_MS);
  };

  const handlePressIn = () => {
    if (disabled || !animated) return;
    Animated.spring(scaleAnim, {
      toValue: intensity,
      useNativeDriver: true,
      speed: 40,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    if (disabled || !animated) return;
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 18,
    }).start();
  };

  const style = StyleSheet.flatten(styleProp ?? {}) as ViewStyle;
  const {
    margin, marginTop, marginBottom, width, top,
    left, minHeight, height, position, bottom, right, zIndex, ...filteredStyle } = style;

  return (
    <NativePressable
      {...props}
      disabled={disabled}
      style={{
        flex: style?.flex,
        alignSelf: style?.alignSelf,
        pointerEvents: style?.pointerEvents,
        minHeight,
        height,
        aspectRatio: style?.aspectRatio,
        margin,
        marginTop,
        marginBottom,
        bottom,
        right,
        top,
        left,
        position,
        zIndex,
      }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      delayLongPress={props.delayLongPress ?? 320}
      onLongPress={(e) => {
        if (disabled) return;
        if (isLocked.current) return;
        if (!props.onLongPress) return;
        lockPress();

        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
        props.onLongPress(e);
      }}
      onPress={(e) => {
        if (disabled) return;

        if (!onDoublePress) {
          if (isLocked.current) return;
          lockPress();
        }

        if (haptic && onPress) void Haptics.selectionAsync();
        if (onPress) onPress(e);

        if (onDoublePress) {
          const now = Date.now();
          if (lastPress.current && now - lastPress.current < PRESS_LOCK_MS) onDoublePress(e);
          lastPress.current = now;
        }
      }}
    >
      <Animated.View style={[filteredStyle, { width, height }, {
        transform: [{ scale: scaleAnim }],
        aspectRatio: style?.aspectRatio,
      }]}>
        {children}
      </Animated.View>
    </NativePressable>
  )
}
