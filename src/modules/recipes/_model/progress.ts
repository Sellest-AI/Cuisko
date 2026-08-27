/**
 * The sweep that stands in for a wait nothing can measure.
 *
 * Creating a recipe is a single `await` on an agent that reports nothing while it runs. Making it
 * report would mean writing a status row and turning a one-call action into a stateful job — so
 * instead the bar is estimated, and the estimate is made honest by one property: it never claims
 * done before it is done.
 *
 * That is what the cap is for. The curve is asymptotic to {@link CAP}, so a run that takes twice
 * the estimate slows down and settles there rather than sitting full while the user waits. 1 is not
 * on this curve at any input; only the action resolving produces it.
 *
 * The approach is asymptotic in arithmetic but not in floating point: past a few multiples of the
 * estimate the exponential underflows and the curve rounds onto {@link CAP} exactly. That is the
 * intended resting place, not a defect — what must never round is the distance from 1.
 */

/** The three things the action is doing, in the order a cook watches them go by. */
export type CreatingPhase = "reading" | "matching" | "finishing";

/**
 * What the sanitize agent costs in practice, for a caller with nothing better to go on.
 *
 * It is a default rather than the rule, because the estimate is the one part of this that is a
 * measurement: a longer recipe, a slower model or a second agent in the chain all move it, and
 * each of those is known at the call site and nowhere near here.
 */
export const DEFAULT_ESTIMATE_MS = 15_000;

/** The ceiling the sweep approaches and never passes. The last tenth belongs to the action. */
const CAP = 0.9;

/** Phase boundaries, as progress rather than as time — so the label and the ring cannot disagree. */
const MATCHING_AT = 0.4;
const FINISHING_AT = 0.75;

/**
 * Builds the sweep for a wait expected to take `estimateMs`.
 *
 * A function rather than a constant curve because the estimate is an input, not a property of the
 * shape: the easing, the cap and the phase boundaries are the same for every wait, and the only
 * thing that changes is how fast it is walked. Fitting it once per caller also keeps the time
 * constant out of the per-frame path — this is called when a wait starts, not on every tick.
 *
 * The returned function answers how full the ring is after `elapsedMs`. Monotonic, eased, and never
 * past {@link CAP} for any input.
 */
export const sweepFor = (estimateMs: number = DEFAULT_ESTIMATE_MS) => {
  /**
   * The time constant, derived rather than tuned: whatever makes the sweep sit exactly on
   * {@link FINISHING_AT} when the estimate runs out. So "Almost there" arrives as the estimate
   * expires, at any estimate, without a second number being re-fitted alongside it.
   *
   * The floor is what stops a nonsense estimate inverting the curve. At zero the time constant
   * collapses and the sweep is at its cap from the first tick; below zero it would run backwards
   * through the cap and off the ring, so one millisecond is the smallest wait this will model.
   */
  const tau = Math.max(estimateMs, 1) / -Math.log(1 - FINISHING_AT / CAP);

  return (elapsedMs: number) => {
    /** A clock that has not started, or one that jumped backwards, both read as nothing done yet. */
    if (elapsedMs <= 0) return 0;

    return CAP * (1 - Math.exp(-elapsedMs / tau));
  };
};

/**
 * Which of the three the ring is labelled with.
 *
 * Read from the progress rather than from the clock, because those are the two things on screen
 * together: a label that changed on its own schedule would announce "Almost there" over a ring
 * three quarters full. It is also why this takes no estimate — the boundaries are positions on the
 * ring, and they do not move when the wait gets longer.
 */
export const phaseAt = (progress: number): CreatingPhase => {
  if (progress < MATCHING_AT) return "reading";
  if (progress < FINISHING_AT) return "matching";

  return "finishing";
};
