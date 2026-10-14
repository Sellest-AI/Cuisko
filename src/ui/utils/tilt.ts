/**
 * How a tilt-driven shift follows the phone's roll, one sensor sample at a time. Pure so it can be
 * tested off the device; `TiltSensor` runs it on the UI thread, hence the worklet directive.
 */

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

/** How close to its target, in points, the shift counts as there. Under it nothing is written:
 *  every write restyles every tilted view, and the sensor never reads the same twice, so without
 *  this a phone lying on a table redrew the screen at the sensor's rate for as long as it lay there.
 *  Half a point is under two pixels, and the shift only ever stops that far short of where it heads. */
const SETTLED = 0.5;

export type TiltSample = {
  /** The phone's left–right roll, as a fraction of gravity. */
  roll: number,
  /** Roll the shift is measured from; `null` before the first reading. */
  neutral: number | null,
  /** The shift as it stands, in points. */
  shift: number,
  /** The largest shift, in points, either way. */
  maxShift: number,
};

export type TiltStep = {
  neutral: number,
  /** The shift to write, or `null` when it should be left where it is. */
  shift: number | null,
};

export const stepTilt = ({ roll, neutral, shift, maxShift }: TiltSample): TiltStep => {
  "worklet";
  const nextNeutral = neutral === null ? roll : neutral + (roll - neutral) * NEUTRAL_FOLLOW;
  const target = Math.max(Math.min(((roll - nextNeutral) / FULL_TILT) * maxShift, maxShift), -maxShift);

  if (Math.abs(target - shift) < SETTLED) return { neutral: nextNeutral, shift: null };

  return { neutral: nextNeutral, shift: shift + (target - shift) * SMOOTHING };
};
