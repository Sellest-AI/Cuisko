/** Chat markdown, read into blocks. Its own file: it is a reader, not a formatter like the rest. */
export * from "./markdown";

const COMPACT_UNITS = [
  { threshold: 1_000_000_000, suffix: "B" },
  { threshold: 1_000_000, suffix: "M" },
  { threshold: 1_000, suffix: "K" },
] as const;

/**
 * A count shortened to at most one decimal: `1300` → `1.3K`, `1_800_000` → `1.8M`.
 *
 * Hand-rolled rather than `Intl.NumberFormat({ notation: 'compact' })` because Hermes ships a
 * trimmed ICU where compact notation is not reliably present — a badge is not the place to
 * discover that at runtime. It also truncates instead of rounding, so the label never claims
 * more views than exist (`1_999` reads `1.9K`, not `2K`).
 */
export const formatCompact = (value: number) => {
  const rounded = Math.trunc(value);
  const magnitude = Math.abs(rounded);
  const sign = rounded < 0 ? "-" : "";

  const unit = COMPACT_UNITS.find(({ threshold }) => magnitude >= threshold);
  if (!unit) return rounded.toString();

  const scaled = Math.trunc((magnitude / unit.threshold) * 10) / 10;
  return `${sign}${Number.isInteger(scaled) ? scaled : scaled.toFixed(1)}${unit.suffix}`;
};

/**
 * A rating at exactly one decimal: `4` → `4.0`, `4.25` → `4.3`.
 *
 * The trailing zero is deliberate — ratings sit in a column of siblings, and a `4` next to a
 * `4.3` reads as a different kind of value rather than the same one at a round number.
 */
export const formatRating = (value: number) => value.toFixed(1);

/**
 * How hard the progress curve bends. 0 would be linear; the higher it goes the more the first step
 * takes and the less is left for the last ones. At 5, step 1 of 5 fills 39% against a linear 20% —
 * enough to feel like a head start, not so much that the last two steps look stalled: they still
 * carry 12% and 10% of the bar between them.
 */
const PROGRESS_CURVE = 5;

/**
 * A linear ratio in 0..1 bent onto a logarithmic curve, still in 0..1 and pinned at both ends.
 *
 * Shared by `StepProgress` and the loading screen's timings, so the two bend alike — but only ever
 * one of them at a time. Bending a bar that is already fed by a bent clock composes the curve with
 * itself, which reads 84% full at the halfway mark; `StepProgress` takes `curve="linear"` to opt
 * out for exactly that case.
 */
export const logCurve = (ratio: number) => Math.log1p(PROGRESS_CURVE * ratio) / Math.log1p(PROGRESS_CURVE);

/** `logCurve` undone: the linear ratio at which the curve reaches `curved`. */
export const inverseLogCurve = (curved: number) =>
  Math.expm1(curved * Math.log1p(PROGRESS_CURVE)) / PROGRESS_CURVE;

/**
 * How long step `position` of `count` stays active, so that one pass lasts `durationMs`.
 *
 * Steps start on the bar's log curve read backwards: the first ones flick by and the last ones
 * take their time, which is how waiting on real work tends to feel. The durations sum to exactly
 * `durationMs`, so a looping sequence starts over on the beat.
 *
 * The bend lives here, so a bar drawn alongside these steps fills linearly in the step index — see
 * `logCurve` for what bending both costs.
 */
export const curvedStepDuration = (position: number, count: number, durationMs: number) => {
  const startsAt = (step: number) => inverseLogCurve(step / count);

  return durationMs * (startsAt(position + 1) - startsAt(position));
};
