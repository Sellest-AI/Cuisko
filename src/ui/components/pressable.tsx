import * as Haptics from "expo-haptics";
import { ComponentProps, useEffect, useRef } from "react";
import { Animated, GestureResponderEvent, Pressable as NativePressable, ViewStyle } from "react-native";

/** How long a press stays locked against a second one. Also the double-tap window. */
const PRESS_LOCK_MS = 300;

type PressableProps = {
  disabled?: boolean;
  animated?: boolean;
  onDoublePress?: (e: GestureResponderEvent) => void;
  children: React.ReactNode;
  intensity?: number;
  style?: ViewStyle;
} & ComponentProps<typeof NativePressable>;

export const Pressable = ({ disabled, onPress, children, animated = true, intensity = 0.98, onDoublePress, style, ...props }: PressableProps) => {
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

  const {
    margin, marginTop, marginBottom, width, top,
    left, minHeight, height, position, bottom, right, zIndex, ...filteredStyle } = (style ?? {}) as ViewStyle;

  return (
    <NativePressable
      {...props}
      disabled={disabled}
      style={{
        flex: style?.flex,
        alignSelf: style?.alignSelf,
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
