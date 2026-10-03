/**
 * Printing, and the arithmetic the printing needs.
 *
 * Nothing here knows what a bake-off is. It exists so that `bakeOff.ts` and `table.ts` format the
 * same number the same way — a latency that reads as `1.4s` in the progress lines and as `1400ms`
 * in the table is two facts to the eye and one to the machine.
 */
import type { Attempt, Effort, Success, ToolUse } from "./types";

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
 * What the bake-off cost, judge included, and how much of it nobody reported.
 *
 * The total is needed twice and computed once. `bakeOff.ts` needs it before the table exists —
 * the transcript is written first, so the table can close by pointing at it — and the table needs
 * the same figure under the ranking. Two sums over the same attempts is two numbers that can
 * disagree, and the one printed to the terminal is the one the reader would trust.
 *
 * `unreported` is what makes the total a floor rather than a price: runs that succeeded and told
 * us nothing about what they billed.
 */
export const spentOn = (attempts: Map<string, Attempt[]>, judgeCost: number | undefined) => {
  const all = [...attempts.values()].flat();
  const reported = succeeded(all)
    .map((attempt) => attempt.cost)
    .filter((cost) => cost !== undefined);

  return {
    spent: reported.reduce((total, cost) => total + cost, 0) + (judgeCost ?? 0),
    generations: reported.length,
    unreported: all.filter((run) => run.ok).length - reported.length,
  };
};

/**
 * How many decimals it takes to show three significant figures of `value`, floored at 2 and capped
 * at 10.
 *
 * A fixed number of decimals cannot serve this table, because one formatter prints both the total
 * spent and a single run's share of it, and those are four orders of magnitude apart. At five
 * decimals a cheap model bills `$0.00001` for every run it ever does — the column stops
 * distinguishing the entrants it exists to distinguish, and the mode delta beside it reads
 * `+$0.00000`, which says "free" when it means "below the resolution I chose to print". Scaling
 * the decimals to the number keeps three real digits wherever the value happens to sit:
 * `$0.0000148` per run, `$0.06` for the run that contained it.
 *
 * Three rather than more because these are measurements of a billed price, not the price itself —
 * a fourth digit implies OpenRouter reported to a precision it does not, and each run rounds
 * differently anyway.
 *
 * The cap is where the rule stops being able to help: below about a hundredth of a millionth of a
 * dollar there is no arrangement of digits that both fits a column and is not a lie, and nothing
 * OpenRouter bills is that small.
 */
const _decimals = (value: number) =>
  value === 0 ? 2 : Math.min(10, Math.max(2, 2 - Math.floor(Math.log10(Math.abs(value)))));

/**
 * USD, to three significant figures.
 *
 * `undefined` is "n/a", never "$0.00": a cost nobody reported and a cost of nothing are opposite
 * facts, and only one of them means the model was free.
 */
export const usd = (value: number | undefined) =>
  value === undefined ? "n/a" : `$${value.toFixed(_decimals(value))}`;

/**
 * A signed USD delta, for the mode comparison.
 *
 * The precision comes off the DIFFERENCE, not off either operand: what the reader is asking is
 * "what did the extra reasoning cost me", and a difference two orders of magnitude smaller than
 * the costs it sits between still deserves its three digits.
 */
export const usdDelta = (value: number | undefined, baseline: number | undefined) => {
  if (value === undefined || baseline === undefined) return "n/a";

  const delta = value - baseline;

  return `${delta >= 0 ? "+" : "-"}$${Math.abs(delta).toFixed(_decimals(delta))}`;
};

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

/**
 * What an entrant did with its tools, one call per line: the step, the tool, its input, and what
 * came back. Shared by the transcript and the judge, so the file a reader hands on and the prompt
 * the judge ranked from show the same calls in the same words.
 *
 * `undefined` when the bake-off offered no tools, so a tool-less transcript reads as it always has.
 */
export const toolUseLines = (uses: ToolUse[] | undefined): string[] | undefined => {
  if (!uses) return undefined;
  if (!uses.length) return ["Tool calls: none — it answered without calling a tool."];

  return [
    `Tool calls (${uses.length}):`,
    ...uses.map(({ step, tool, input, output }) =>
      `- step ${step} · ${tool}(${JSON.stringify(input)}) → ` +
      (output === undefined ? "no result (the call failed)" : JSON.stringify(output)),
    ),
  ];
};
