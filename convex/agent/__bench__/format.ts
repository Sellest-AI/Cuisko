/**
 * Printing, and the arithmetic the printing needs.
 *
 * Nothing here knows what a bake-off is. It exists so that `bakeOff.ts` and `table.ts` format the
 * same number the same way — a latency that reads as `1.4s` in the progress lines and as `1400ms`
 * in the table is two facts to the eye and one to the machine.
 */
import type { Attempt, Effort, Success } from "./types";

/**
 * Straight to stdout, bypassing `console` entirely.
 *
 * A bake-off is minutes long, and a terminal that prints nothing for four minutes is
 * indistinguishable from a hung one — so progress is not decoration here, it is the difference
 * between waiting and killing the run. `console.log` inside a test is Vitest's to intercept,
 * buffer, and replay under a `stdout |` heading after the file finishes; `process.stdout.write`
 * is not, so it lands the moment it is called whatever the reporter is doing. The `manual` project
 * also sets `disableConsoleIntercept`, and this belt-and-braces is deliberate: the two together
 * mean a reporter change cannot silently take the progress away again.
 */
export const say = (line: string) => process.stdout.write(`${line}\n`);

/** `false` is a legal effort and an illegal thing to print; a budget needs to look like one. */
export const mode = (effort: Effort) =>
  effort === false ? "off" : typeof effort === "number" ? `≤${effort}` : effort;

/**
 * Whether the entrant was asked to reason at all.
 *
 * Not `Boolean(effort)`: a budget of `0` is falsy and would read as reasoning-off, which would
 * quietly suppress the "setting ignored?" warning on exactly the entrant most likely to need it.
 * Only `false` means off.
 */
export const isReasoning = (effort: Effort) => effort !== false;

/**
 * The blind label an entrant runs under.
 *
 * Letters, and past 26 a letter with a digit — a bake-off that big is a mistake, but it should
 * print rather than collide.
 */
export const label = (index: number) =>
  index < 26
    ? String.fromCharCode(65 + index)
    : `${String.fromCharCode(65 + (index % 26))}${Math.floor(index / 26)}`;

/** Seconds to one decimal, right-aligned, because these are read as a column. */
export const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`.padStart(7);

export const num = (value: number) => value.toLocaleString("en-US");

/** A signed number, so a delta of 0 reads as "+0" rather than as an absolute. */
export const signed = (value: number) => `${value >= 0 ? "+" : ""}${num(value)}`;

export const round = (value: number) => Math.round(value * 10) / 10;

export const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);

  return sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 0;
};

export const succeeded = (attempts: Attempt[]) =>
  attempts.filter((attempt): attempt is Success => attempt.ok);

/**
 * The mean cost of the runs that reported one, or `undefined` when none did.
 *
 * Mean rather than median, unlike the latency and token columns beside it. Those answer "what does
 * a typical run look like", where an outlier is noise you want suppressed. Cost answers "what will
 * this bill me", where the outlier IS the bill — a model that is cheap twice and expensive once
 * costs the average, not the median, and the median would hide exactly the variance that decides
 * whether you can afford it.
 */
export const meanCost = (attempts: Success[]) => {
  const costs = attempts.map((attempt) => attempt.cost).filter((cost) => cost !== undefined);

  return costs.length ? costs.reduce((total, cost) => total + cost, 0) / costs.length : undefined;
};

/**
 * USD at five decimals — these are fractions of a cent, and `toFixed(2)` would print every row as
 * "$0.00". `undefined` is "n/a", never "$0.00000": a cost nobody reported and a cost of nothing are
 * opposite facts.
 */
export const usd = (value: number | undefined) =>
  value === undefined ? "n/a" : `$${value.toFixed(5)}`;

/** A signed USD delta, for the mode comparison. */
export const usdDelta = (value: number | undefined, baseline: number | undefined) =>
  value === undefined || baseline === undefined
    ? "n/a"
    : `${value - baseline >= 0 ? "+" : "-"}$${Math.abs(value - baseline).toFixed(5)}`;

/**
 * Distinct strings with their counts, commonest first — `not numeric (×3), no step uses it`.
 *
 * A candidate that broke the same rule on all three runs and one that broke three different rules
 * are opposite diagnoses, and a flat list of five strings reads as the same thing. The count is
 * what separates a model with a habit from a model that is merely unstable.
 */
export const tally = (items: string[]) => {
  const counts = items.reduce(
    (seen, item) => seen.set(item, (seen.get(item) ?? 0) + 1),
    new Map<string, number>(),
  );

  return [...counts]
    .sort(([, a], [, b]) => b - a)
    .map(([item, count]) => (count > 1 ? `${item} (×${count})` : item))
    .join(", ");
};
