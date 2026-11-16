"use node"
/**
 * `runBakeOff` — give it a field of models and one task, get back a table you read.
 *
 * ⚠️ THIS COSTS MONEY AND MINUTES. It calls OpenRouter for real — one generation per entrant per
 * run, plus one judge call. An entrant is a model AT one effort, so five models each listed with
 * two modes is ten entrants, and at `runs` 3 that is thirty generations.
 *
 * It needs a real `OPENROUTER_API_KEY` in `.env.local` (gitignored — see `.env.example`), because
 * the one the test runner injects is a placeholder.
 *
 * Callers live in a `*.manual.test.ts`, which the `manual` Vitest project alone collects — nothing
 * automatic runs them. See the `manual` project in vitest.config.mts for why that is a project and
 * not a hidden file.
 *
 * Several inputs of one task go to `runSuite` instead, which pays for one judge over all of them.
 */
import { say, secs, spentOn } from "./format";
import { announce, blindField, counts, DEFAULTS, generate, openrouter as connect } from "./generate";
import { DEFAULT_JUDGE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS } from "./provider";
import type { BakeOff, BakeOffResult } from "./types";
import { rank } from "./verdict";

export const runBakeOff = async <Raw, Parsed>(
  options: BakeOff<Raw, Parsed>,
): Promise<BakeOffResult> => {
  const {
    title,
    candidates,
    system,
    prompt: input,
    answer,
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

  const openrouter = connect();
  const entrants = blindField(candidates);

  announce({
    entrants,
    runs,
    inputs: 1,
    maxConcurrency,
    timeoutMs,
    then: judge === false ? ", and no judge" : `, then 1 judge call to ${judge} (${Math.round(judgeTimeoutMs / 1000)}s)`,
  });

  const started = Date.now();
  const attempts = await generate({
    openrouter, entrants, runs, system, prompt: input, answer, tools, provider, maxConcurrency, timeoutMs,
  });

  if (judge === false) {
    say("");
    say(`  generations done in ${secs(Date.now() - started).trim()}. No judge.`);

    return { ...counts(attempts), spent: spentOn(attempts, undefined).spent, path: undefined, entrants, attempts };
  }

  const { spent, path } = await rank({
    openrouter, title, judge, judgeTimeoutMs, provider, runs, system, rules, criteria, candidates, entrants,
    cases: [{ input, attempts }],
    started,
  });

  return { ...counts(attempts), spent, path, entrants, attempts };
};
