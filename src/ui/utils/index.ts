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
