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
  entrantName,
  isReasoning,
  meanCost,
  median,
  mode,
  num,
  round,
  signed,
  spentOn,
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

/**
 * The last thing printed, because it is the next thing to do.
 *
 * This table ranks the field; it cannot tell you whether the field itself is the problem. When
 * every candidate scores badly, or the top two are separated by noise, the answer is not in these
 * rows — it is in the prompt, the schema and the answers themselves, and those are on disk. The
 * transcript is written to be handed over whole, which is a step nobody takes if they do not know
 * the file is there, so the invitation goes where the disappointment happens.
 */
const _handOff = (transcript: string) => [
  "",
  `  full transcript, prompt and every answer included:  ${transcript}`,
  "",
  "  This ranking is one judge's opinion over a handful of runs — a shortlist, not a result. Hand",
  "  that file to another model, in a fresh conversation, and ask it to re-rank the answers itself,",
  "  say where it disagrees with the judge, and name what in the system prompt or the schema caused",
  "  the failures it can see. That is the pass that improves the instructions; this one only tells",
  "  you who is winning under the instructions you already have.",
];

export const table = (options: {
  title: string;
  judge: string;
  runs: number;
  candidates: readonly Candidate[];
  verdict: Verdict;
  entrants: Map<string, Entrant>;
  attempts: Map<string, Attempt[]>;
  judgeCost: number | undefined;
  transcript: string;
}) => {
  const { title, judge, runs, candidates, verdict, entrants, attempts, judgeCost, transcript } =
    options;

  const rows = [...verdict.rows].sort((a, b) => a.rank - b.rank);
  const scores = new Map(rows.map((row) => [row.label, row.score]));

  const ranking = rows.flatMap((row) => {
    const entrant = entrants.get(row.label);
    const all = attempts.get(row.label) ?? [];
    const ok = succeeded(all);
    const name = entrant ? entrantName(entrant, "  ·  ") : `unknown (${row.label})`;

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
    .flatMap(({ name, modes, provider }) => {
      const of = (effort: Effort) => {
        // The routing by reference: the entrant carries its candidate's own object, and the same
        // model listed on two hosts is two candidates with two baselines.
        const label = [...entrants].find(
          ([, entrant]) =>
            entrant.model === name && entrant.effort === effort && entrant.provider === provider,
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
            `${num(tokens).padStart(8)} tok  ${usd(cost).padStart(12)}   ${delta}`
          );
        }),
      ];
    });

  // What the whole bake-off cost, judge included. It is the number you actually spent, and it is
  // the one you will want before deciding whether to run it again with a longer candidate list.
  const { spent, generations, unreported } = spentOn(attempts, judgeCost);

  const text = [
    "",
    "═".repeat(WIDTH),
    `  ${title} bake-off — ${entrants.size} entrants × ${runs} runs, judged by ${judge}`,
    "═".repeat(WIDTH),
    ...ranking,
    ...(compared.length ? ["", "─".repeat(WIDTH), "  WORTH THE TOKENS?", ...compared] : []),
    "",
    "─".repeat(WIDTH),
    `  total spent: ${usd(spent)}  (${generations} generations ` +
      `${usd(spent - (judgeCost ?? 0))} + judge ${usd(judgeCost)})` +
      (unreported ? `  ·  ⚠ ${unreported} run(s) reported no cost, so this is a floor` : ""),
    "─".repeat(WIDTH),
    verdict.verdict.replace(/^/gm, "  "),
    "─".repeat(WIDTH),
    ..._handOff(transcript),
    "",
  ].join("\n");

  return text;
};
