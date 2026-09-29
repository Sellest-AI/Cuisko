import { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import { SensorType, useAnimatedReaction, useAnimatedSensor, type SharedValue } from "react-native-reanimated";
import { useIsFocused } from "expo-router";
import { useReduceMotion } from "@ui/hooks/useReduceMotion";

/** How far the phone must roll away from how it is held for the full shift: about 15°, as a
 *  fraction of gravity. Past it the shift stays pinned at `maxShift`. */
const FULL_TILT = 0.25;

/** How fast "how it is held" follows the hand, per sample. Small on purpose: a quick tilt reads as
 *  a tilt, while lying on the couch with the phone on its side drifts back to rest in seconds
 *  instead of leaving everything pushed to one edge. */
const NEUTRAL_FOLLOW = 0.004;

/** How much of the gap to the target the shift closes per sample. This is what turns the sensor's
 *  jitter into a glide, and what eases the shift back in when listening resumes. */
const SMOOTHING = 0.12;

/** How long after the caller's content last moved on its own the shift stays held, in ms. Longer
 *  than the gap between two scroll events, so a swipe holds it from its first frame to its last. */
const HOLD_AFTER_MOVE = 150;

/** One sample per frame at 60Hz. The constants above are per sample, so this fixes their pace. */
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
 * reader not asking for reduced motion. Reanimated registers a sensor on mount and has no pause, so
 * those conditions mount and unmount `Listener` rather than toggling a flag — which is what actually
 * releases it. Android in particular keeps a registered listener running in the background.
 *
 * Off on web: browser motion sensors are missing on most desktops and behind a permission prompt on
 * iOS Safari, and a prompt is too high a price for a few points of drift.
 */
export const TiltSensor = ({ tilt, maxShift, movedAt }: Props) => {
  const isFocused = useIsFocused();
  const reduceMotion = useReduceMotion();
  const [isForeground, setIsForeground] = useState(AppState.currentState === "active");

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setIsForeground(state === "active"));

    return () => subscription.remove();
  }, []);

  /** Turning the setting on mid-session asks for the motion to stop now: the plates go back to
   *  rest at once rather than easing there, since easing is itself the motion. */
  useEffect(() => {
    if (reduceMotion) tilt.shift.set(0);
  }, [reduceMotion, tilt]);

  if (Platform.OS === "web" || !isFocused || !isForeground || reduceMotion) return null;

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

      const roll = x / magnitude;

      const previous = tilt.neutral.get();
      const neutral = previous === null ? roll : previous + (roll - previous) * NEUTRAL_FOLLOW;

      tilt.neutral.set(neutral);

      const target = Math.max(Math.min(((roll - neutral) / FULL_TILT) * maxShift, maxShift), -maxShift);
      const shift = tilt.shift.get();

      tilt.shift.set(shift + (target - shift) * SMOOTHING);
    }
  );

  return null;
};
