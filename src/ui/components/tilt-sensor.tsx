import { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import { SensorType, useAnimatedReaction, useAnimatedSensor, type SharedValue } from "react-native-reanimated";
import { useIsFocused } from "expo-router";
import { useIsMotionAllowed } from "@ui/hooks/useIsMotionAllowed";
import { stepTilt } from "@ui/utils";

/** How long after the caller's content last moved on its own the shift stays held, in ms. Longer
 *  than the gap between two scroll events, so a swipe holds it from its first frame to its last. */
const HOLD_AFTER_MOVE = 150;

/** One sample per frame at 60Hz. `stepTilt`'s constants are per sample, so this fixes their pace. */
const INTERVAL = 16;

export type Tilt = {
  /** Horizontal offset in points, positive when the phone's right edge is down. */
  shift: SharedValue<number>,
  /** Roll the shift is measured from, as a fraction of gravity. `null` until the first reading.
   *  Owned by the caller so it survives the sensor unmounting: coming back to the screen with the
   *  phone rolled then eases the shift out to that roll instead of starting from flat. */
  neutral: SharedValue<number | null>
}

type Props = {
  tilt: Tilt,
  /** The largest shift, in points, either way. */
  maxShift: number,
  /** When the caller's content last moved on its own (a scroll), as `performance.now()`. The shift
   *  holds still while it moves: each write restyles every tilted view, and the sensor's clock is
   *  not the scroll's, so writing mid-swipe paid for a second layout commit in the same frame. */
  movedAt?: SharedValue<number>
}

/**
 * Writes the phone's left–right roll into `tilt.shift`, and renders nothing.
 *
 * The sensor only runs while it is useful: the screen focused, the app in the foreground, and the
 * motion allowed (`useIsMotionAllowed`: not on an old device, nor for a reader who turned animations
 * off). Reanimated registers a sensor on mount and has no pause, so
 * those conditions mount and unmount `Listener` rather than toggling a flag — which is what actually
 * releases it. Android in particular keeps a registered listener running in the background.
 *
 * Off on web: browser motion sensors are missing on most desktops and behind a permission prompt on
 * iOS Safari, and a prompt is too high a price for a few points of drift.
 */
export const TiltSensor = ({ tilt, maxShift, movedAt }: Props) => {
  const isFocused = useIsFocused();
  const isMotionAllowed = useIsMotionAllowed();
  const [isForeground, setIsForeground] = useState(AppState.currentState === "active");

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setIsForeground(state === "active"));

    return () => subscription.remove();
  }, []);

  /** Turning the setting on mid-session asks for the motion to stop now: the plates go back to
   *  rest at once rather than easing there, since easing is itself the motion. */
  useEffect(() => {
    if (!isMotionAllowed) tilt.shift.set(0);
  }, [isMotionAllowed, tilt]);

  if (Platform.OS === "web" || !isFocused || !isForeground || !isMotionAllowed) return null;

  return <Listener tilt={tilt} maxShift={maxShift} movedAt={movedAt} />;
};

const Listener = ({ tilt, maxShift, movedAt }: Props) => {
  const gravity = useAnimatedSensor(SensorType.GRAVITY, { interval: INTERVAL });

  useAnimatedReaction(
    () => gravity.sensor.value,
    ({ x, y, z }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);

      /** Before its first reading the sensor holds zeros. Treating that as "flat" would snap the
       *  target to the middle for a frame on every return — the jump this component exists to avoid. */
      if (magnitude < 1) return;

      /** Skipped whole, the neutral included: resuming then eases the shift to wherever the phone
       *  is, through the same smoothing as any other change. */
      if (movedAt && performance.now() - movedAt.get() < HOLD_AFTER_MOVE) return;

      const step = stepTilt({ roll: x / magnitude, neutral: tilt.neutral.get(), shift: tilt.shift.get(), maxShift });

      // The neutral restyles nothing, so it is written every sample; the shift only when it moves.
      tilt.neutral.set(step.neutral);
      if (step.shift !== null) tilt.shift.set(step.shift);
    }
  );

  return null;
};
