import { useIsFocused } from "expo-router";
import { ComponentProps, ReactNode } from "react";
import { type ViewStyle } from "react-native";
import Animated, { useAnimatedRef } from "react-native-reanimated";

import { useIsMotionAllowed } from "@ui/hooks/useIsMotionAllowed";

import { usePaw } from "./paw-layer";

type Props = {
  children: ReactNode;
  /** Shows the paw while true: this is the next thing to tap. */
  active: boolean;
  /**
   * The child's own layout transition, lifted onto the wrapper. A card that flies between sections
   * animates its own box, and inside a wrapper that box never moves: the wrapper does, instantly.
   * Dropped where motion is not allowed, so the card lands in place.
   */
  layout?: ComponentProps<typeof Animated.View>["layout"];
  style?: ViewStyle;
};

/**
 * The onboarding's "tap here": Cuisko's paw, tapping at the corner of whatever the next move is.
 *
 * It only marks the target. The paw itself is drawn by the chrome's `PawLayer`, above everything,
 * and follows this wrapper wherever it goes, so no scroll view can clip it and no neighbour can
 * cover it. Only on the focused step: a step left mounted under the next one keeps its hint to
 * itself instead of pointing through the screen on top.
 */
export const Hint = ({ children, active, layout, style }: Props) => {
  const target = useAnimatedRef<Animated.View>();
  const isFocused = useIsFocused();
  const isMotionAllowed = useIsMotionAllowed();

  usePaw(target, active && isFocused);

  return (
    <Animated.View ref={target} layout={isMotionAllowed ? layout : undefined} style={style} collapsable={false}>
      {children}
    </Animated.View>
  );
};
