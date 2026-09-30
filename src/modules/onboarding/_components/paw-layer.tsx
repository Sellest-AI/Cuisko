import { createContext, ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  measure,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  type AnimatedRef,
  type SharedValue,
} from "react-native-reanimated";

import { Image } from "@ui/image";
import { m } from "@ui/motion";

import paw from "assets/images/onboarding/paw.webp";

/** The paw's drawn size: the file is 205 × 240, the tip of its pointing toe near its top-left corner. */
const PAW_WIDTH = 48;
const PAW_HEIGHT = Math.round((PAW_WIDTH * 240) / 205);
/** How far the drawing reaches back over its target, so the fingertip lands just inside the corner. */
const TIP_INSET = 22;

type PawTarget = AnimatedRef<Animated.View>;

/** 1 while the hint is on, 0 the moment it goes off: read by the paw on the UI thread. */
type PawSwitch = SharedValue<number>;

type Shown = { id: number; target: PawTarget; isOn: PawSwitch };

/** Puts a paw on `target` until the returned function takes it away. */
type Show = (target: PawTarget, isOn: PawSwitch) => () => void;

const PawLayerContext = createContext<Show | null>(null);

/**
 * The layer Cuisko's paws are drawn in: above the whole onboarding, the pill included, and touched
 * by nothing, so a tap goes through the paw to the control under it.
 *
 * Drawn here rather than inside each target because a target lives where its screen put it: in a
 * scroll view that clips whatever hangs past it (the fake bar's rail of hints), or under a sibling
 * drawn later. Up here nothing clips or covers it, and the paw follows its target instead: each
 * frame it measures where the target is on screen and moves to its bottom-right corner, so it rides
 * along through a scroll, a card flying to the cellar, or the bar sliding away.
 */
export const PawLayer = ({ children }: { children: ReactNode }) => {
  const host = useAnimatedRef<Animated.View>();
  const [shown, setShown] = useState<Shown[]>([]);
  const nextId = useRef(0);

  const show = useCallback<Show>((target, isOn) => {
    const id = nextId.current++;

    setShown((current) => [...current, { id, target, isOn }]);

    return () => setShown((current) => current.filter((entry) => entry.id !== id));
  }, []);

  return (
    <PawLayerContext.Provider value={show}>
      {children}
      <Animated.View ref={host} pointerEvents="none" style={StyleSheet.absoluteFill}>
        {shown.map(({ id, target, isOn }) => (
          <Paw key={id} target={target} isOn={isOn} host={host} />
        ))}
      </Animated.View>
    </PawLayerContext.Provider>
  );
};

/**
 * Shows a paw on `target` while `isShown`. A no-op outside a `PawLayer`.
 *
 * Two levers, because they move at different speeds. The paw is added and removed through React
 * state, which lands a render or more later, while the tap that switched the hint off has already
 * started moving the target (a tapped chip slides to the end of the rail at once): a paw still
 * following it would ride the slide before going. So the switch is also a shared value, flipped in a
 * layout effect, in step with the commit that starts the slide, and the UI thread hides the paw on
 * its next frame.
 */
export const usePaw = (target: PawTarget, isShown: boolean) => {
  const show = useContext(PawLayerContext);
  const isOn = useSharedValue(0);

  useLayoutEffect(() => {
    isOn.value = isShown ? 1 : 0;
  }, [isShown, isOn]);

  useEffect(() => {
    if (!isShown || !show) return;

    return show(target, isOn);
  }, [isShown, show, target, isOn]);
};

/**
 * One paw, following its target. Measured on the UI thread every frame, since what moves the target
 * (a scroll, a layout transition) never tells React; hidden on a frame the target cannot be measured,
 * such as the one before it is laid out.
 */
const Paw = ({ target, isOn, host }: { target: PawTarget; isOn: PawSwitch; host: PawTarget }) => {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const isPlaced = useSharedValue(0);

  useFrameCallback(() => {
    /** Switched off: stays where it last was, hidden, rather than following the target away. */
    if (isOn.value === 0) return;

    const box = measure(target);
    const origin = measure(host);

    if (!box || !origin) {
      isPlaced.value = 0;
      return;
    }

    x.value = box.pageX - origin.pageX + box.width - TIP_INSET;
    y.value = box.pageY - origin.pageY + box.height - TIP_INSET;
    isPlaced.value = 1;
  });

  const placed = useAnimatedStyle(() => ({
    opacity: isPlaced.value * isOn.value,
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));

  return (
    <Animated.View style={[styles.paw, placed]}>
      <m.View
        from={{ translateY: -6, scale: 1 }}
        animate={{ translateY: 2, scale: 0.85 }}
        transition={{ type: "timing", duration: 550, loop: true }}
      >
        <Image source={paw} contentFit="contain" transition={false} style={styles.pawImage} />
      </m.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  paw: { position: "absolute", top: 0, left: 0 },
  pawImage: { width: PAW_WIDTH, height: PAW_HEIGHT },
});
