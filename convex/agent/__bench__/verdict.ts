"use node"
/**
 * The half of a bake-off that ranks: one judge call over every case, then the transcript and the
 * table. `runBakeOff` hands it one case, `runSuite` all of its cases.
 */
import { num, say, secs, spentOn, usd } from "./format";
import type { OpenRouter } from "./generate";
import { judge as runJudge, judgePrompt } from "./judge";
import { table } from "./table";
import { transcript, type TranscriptCase } from "./transcript";
import type { Attempt, Candidate, Entrant, ProviderRouting } from "./types";

/** Each letter's runs over every case, in case order: what the table and the total read. */
export const mergeAttempts = (cases: readonly TranscriptCase[]) =>
  new Map<string, Attempt[]>(
    [...(cases[0]?.attempts.keys() ?? [])].map((label) => [
      label,
      cases.flatMap(({ attempts }) => attempts.get(label) ?? []),
    ]),
  );

export const rank = async (options: {
  openrouter: OpenRouter;
  title: string;
  judge: string;
  judgeTimeoutMs: number;
  provider?: ProviderRouting;
  runs: number;
  system: string;
  rules: string;
  criteria: readonly string[];
  candidates: readonly Candidate[];
  entrants: Map<string, Entrant>;
  cases: readonly TranscriptCase[];
  /** When the generations started, for the line that announces the judge. */
  started: number;
}): Promise<{ spent: number; path: string }> => {
  const { openrouter, title, judge, judgeTimeoutMs, provider, runs, system, rules, criteria, candidates, entrants, cases, started } =
    options;

  // The judge is one call over every answer at once, so it is the longest single wait in the run
  // and the one most likely to look like a hang. Announce it before, and time it.
  const prompt = judgePrompt({
    rules,
    criteria,
    runs,
    cases: cases.map(({ title: caseTitle, input, attempts }) => ({
      title: caseTitle,
      input,
      candidates: [...attempts].map(([label, all]) => ({ label, attempts: all })),
    })),
  });

  say("");
  say(
    `  generations done in ${secs(Date.now() - started).trim()}. Judging with ${judge} ` +
    `(~${num(Math.round(prompt.length / 4))} tokens of prompt) …`,
  );

  const judging = Date.now();
  const { verdict, cost: judgeCost } = await runJudge(openrouter.chat(judge), prompt, provider, judgeTimeoutMs);

  say(`  judged in ${secs(Date.now() - judging).trim()} for ${usd(judgeCost)}.`);

  // The transcript is written BEFORE the table is printed, because the table ends by pointing at
  // it: the table is read now and gone with the scrollback, and the file is what survives the run
  // and what gets handed to whoever — or whatever — has to decide whether the prompt is the problem.
  const attempts = mergeAttempts(cases);
  const { spent } = spentOn(attempts, judgeCost);

  const path = transcript({ title, judge, runs, system, cases, criteria, verdict, entrants, spent });

  say(table({ title, judge, runs, inputs: cases.length, candidates, verdict, entrants, attempts, judgeCost, transcript: path }));

  return { spent, path };
};
