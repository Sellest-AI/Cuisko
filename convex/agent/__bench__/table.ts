/**
 * The ranking, then the same numbers regrouped by model.
 *
 * Two sections because there are two questions and one ordering cannot answer both. The ranking
 * answers "what should I ship"; it interleaves models, so a model's own modes land rows apart and
 * the one thing you wanted to compare is the one thing you cannot see. The second section puts a
 * model's modes on consecutive lines with the delta already subtracted, which is the whole reason
 * `modes` exists.
 */
import {
  isReasoning,
  meanCost,
  median,
  mode,
  num,
  round,
  signed,
  succeeded,
  tally,
  usd,
  usdDelta,
} from "./format";
import type { Verdict } from "./judge";
import type { Attempt, Candidate, Effort, Entrant, Success } from "./types";

const WIDTH = 98;

/**
 * The deterministic half of a candidate's row, or nothing at all when no check ran.
 *
 * It sits directly under the judge's score on purpose: the score is an opinion and this line is
 * not, and a candidate the judge liked with two flagged runs is exactly the disagreement you want
 * to see before shipping it.
 */
const _flags = (ok: Success[]) => {
  const flagged = ok.filter((attempt) => attempt.flags.length);
  if (!flagged.length) return [];

  return [
    `      checks: ${ok.length - flagged.length}/${ok.length} runs clean · ` +
      tally(flagged.flatMap((attempt) => attempt.flags)),
  ];
};

export const table = (options: {
  title: string;
  judge: string;
  runs: number;
  candidates: readonly Candidate[];
  verdict: Verdict;
  entrants: Map<string, Entrant>;
  attempts: Map<string, Attempt[]>;
  judgeCost: number | undefined;
}) => {
  const { title, judge, runs, candidates, verdict, entrants, attempts, judgeCost } = options;

  const rows = [...verdict.rows].sort((a, b) => a.rank - b.rank);
  const scores = new Map(rows.map((row) => [row.label, row.score]));

  const ranking = rows.flatMap((row) => {
    const entrant = entrants.get(row.label);
    const all = attempts.get(row.label) ?? [];
    const ok = succeeded(all);
    const name = entrant
      ? `${entrant.model}  ·  reasoning ${mode(entrant.effort)}`
      : `unknown (${row.label})`;

    return [
      "",
      `  #${row.rank}  ${name}`,
      `      ${row.score}/10 · ${ok.length}/${all.length} ok · ` +
        `~${num(median(ok.map((a) => a.ms)))} ms · ~${num(median(ok.map((a) => a.tokens)))} tok · ` +
        `${usd(meanCost(ok))}/run`,
      ..._flags(ok),
      `      ${row.note}`,
      `      runs: ${row.consistency}`,
    ];
  });

  // Only models listed with more than one mode have a delta to show. A one-mode model is already
  // in the ranking above, and repeating it here would be noise.
  const compared = candidates
    .filter(({ modes }) => modes.length > 1)
    .flatMap(({ name, modes }) => {
      const of = (effort: Effort) => {
        const label = [...entrants].find(
          ([, entrant]) => entrant.model === name && entrant.effort === effort,
        )?.[0];
        const ok = succeeded(label ? (attempts.get(label) ?? []) : []);

        return {
          score: label ? (scores.get(label) ?? 0) : 0,
          tokens: median(ok.map((attempt) => attempt.tokens)),
          reasoning: median(ok.map((attempt) => attempt.reasoning)),
          cost: meanCost(ok),
        };
      };

      const baseline = of(modes[0]!);

      return [
        "",
        `  ${name}`,
        ...modes.map((effort, index) => {
          const { score, tokens, reasoning, cost } = of(effort);
          const delta =
            index === 0
              ? "baseline"
              : `${signed(round(score - baseline.score))} pts for ` +
                `${usdDelta(cost, baseline.cost)} (${signed(tokens - baseline.tokens)} tok)` +
                (isReasoning(effort) && reasoning === 0
                  ? "   ⚠ 0 reasoning tokens — setting ignored?"
                  : "");

          return (
            `      ${mode(effort).padEnd(7)} ${String(score).padStart(4)}/10  ` +
            `${num(tokens).padStart(8)} tok  ${usd(cost).padStart(10)}   ${delta}`
          );
        }),
      ];
    });

  // What the whole bake-off cost, judge included. It is the number you actually spent, and it is
  // the one you will want before deciding whether to run it again with a longer candidate list.
  const generations = [...attempts.values()]
    .flatMap((all) => succeeded(all))
    .map((attempt) => attempt.cost)
    .filter((cost) => cost !== undefined);

  const spent = generations.reduce((total, cost) => total + cost, 0) + (judgeCost ?? 0);
  const unreported =
    [...attempts.values()].flat().filter((run) => run.ok).length - generations.length;

  const text = [
    "",
    "═".repeat(WIDTH),
    `  ${title} bake-off — ${entrants.size} entrants × ${runs} runs, judged by ${judge}`,
    "═".repeat(WIDTH),
    ...ranking,
    ...(compared.length ? ["", "─".repeat(WIDTH), "  WORTH THE TOKENS?", ...compared] : []),
    "",
    "─".repeat(WIDTH),
    `  total spent: ${usd(spent)}  (${generations.length} generations ` +
      `${usd(spent - (judgeCost ?? 0))} + judge ${usd(judgeCost)})` +
      (unreported ? `  ·  ⚠ ${unreported} run(s) reported no cost, so this is a floor` : ""),
    "─".repeat(WIDTH),
    verdict.verdict.replace(/^/gm, "  "),
    "─".repeat(WIDTH),
    "",
  ].join("\n");

  return { text, spent };
};
