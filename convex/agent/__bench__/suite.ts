"use node"
/**
 * `runSuite` — a bake-off over several inputs of one task, ranked by ONE judge.
 *
 * ⚠️ THIS COSTS MONEY AND MINUTES, like `runBakeOff`: one generation per entrant per run per case,
 * plus one judge call. Same key, same `*.manual.test.ts` home — see `runBakeOff`'s docblock.
 *
 * Each case is generated on its own, as the tool ships it: one input per call, its own answer
 * contract and checks. The letters are drawn once, so "A" is the same model in every case, and the
 * judge then reads every case at once. That is cheaper than a judge per case, and it is the only
 * judge that can see a model get the units right and the refusals wrong.
 *
 * The cases run one after the other, each behind the concurrency cap: a case's progress lines stay
 * together, under its title.
 */
import { say, spentOn } from "./format";
import { announce, blindField, counts, DEFAULTS, generate, openrouter as connect } from "./generate";
import { DEFAULT_JUDGE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS } from "./provider";
import type { Attempt, Suite, SuiteResult } from "./types";
import { rank } from "./verdict";

export const runSuite = async <Raw, Parsed>(options: Suite<Raw, Parsed>): Promise<SuiteResult> => {
  const {
    title,
    candidates,
    system,
    cases,
    tools,
    criteria,
    rules = system,
    provider,
    judge = DEFAULTS.judge,
    runs = DEFAULTS.runs,
    maxConcurrency = DEFAULTS.maxConcurrency,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    judgeTimeoutMs = DEFAULT_JUDGE_TIMEOUT_MS,
  } = options;

  if (!cases.length) throw new Error(`runSuite "${title}": no cases.`);

  const openrouter = connect();
  const entrants = blindField(candidates);

  announce({
    entrants,
    runs,
    inputs: cases.length,
    maxConcurrency,
    timeoutMs,
    then: `, then 1 judge call to ${judge} (${Math.round(judgeTimeoutMs / 1000)}s)`,
  });

  const started = Date.now();
  const generated: { title: string; input: string; attempts: Map<string, Attempt[]> }[] = [];

  for (const [index, { title: caseTitle, prompt, answer }] of cases.entries()) {
    say(`  — input ${index + 1}/${cases.length}: ${caseTitle}`);
    const attempts = await generate({
      openrouter, entrants, runs, system, prompt, answer, tools, provider, maxConcurrency, timeoutMs,
    });
    generated.push({ title: caseTitle, input: prompt, attempts });
    say("");
  }

  const { spent, path } = await rank({
    openrouter, title, judge, judgeTimeoutMs, provider, runs, system, rules, criteria, candidates, entrants,
    cases: generated,
    started,
  });

  return {
    cases: generated.map(({ title: caseTitle, attempts }) => ({
      title: caseTitle,
      result: { ...counts(attempts), spent: spentOn(attempts, undefined).spent, path, entrants, attempts },
    })),
    spent,
    path,
  };
};
