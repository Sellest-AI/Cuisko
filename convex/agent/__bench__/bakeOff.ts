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
 */
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

import { transcript } from "./transcript";
import { label as blindLabel, mode, num, say, secs, spentOn, usd } from "./format";
import { judge as runJudge, judgePrompt } from "./judge";
import { pool } from "./pool";
import { attempt, DEFAULT_JUDGE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS } from "./provider";
import { table } from "./table";
import type { Attempt, BakeOff, BakeOffResult, Entrant } from "./types";

const DEFAULTS = {
  judge: "google/gemini-3.8-flash",
  runs: 3,
  maxConcurrency: 15,
} as const;

/**
 * The real OpenRouter key.
 *
 * The `manual` project loads `.env.local` over the placeholder the other projects use, so the
 * check is on the placeholder rather than on absence — a run against `test-openrouter-api-key-…`
 * fails on every entrant with an auth error and looks like a field of bad models.
 */
const _openrouterKey = () => {
  const key = process.env.OPENROUTER_API_KEY;

  if (!key || key.startsWith("test-"))
    throw new Error(
      "A bake-off needs a real OPENROUTER_API_KEY. Add it to .env.local (gitignored), or run " +
      "with it in the environment. `npx convex env get OPENROUTER_API_KEY` prints the one the " +
      "deployment uses.",
    );

  return key;
};

export const runBakeOff = async <Raw, Parsed>(
  options: BakeOff<Raw, Parsed>,
): Promise<BakeOffResult> => {
  const {
    title,
    candidates,
    system,
    prompt: input,
    answer,
    criteria,
    rules = system,
    provider,
    judge = DEFAULTS.judge,
    runs = DEFAULTS.runs,
    maxConcurrency = DEFAULTS.maxConcurrency,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    judgeTimeoutMs = DEFAULT_JUDGE_TIMEOUT_MS,
  } = options;

  const openrouter = createOpenRouter({ apiKey: _openrouterKey() });

  const field: Entrant[] = candidates.flatMap(({ name, modes }) =>
    modes.map((effort) => ({ model: name, effort })),
  );

  // Letters assigned by shuffle, so a judge with a positional bias — and they all have one — does
  // not hand it to whichever entrant happens to be first. It matters most with several modes per
  // model: unshuffled, a model's modes would always land adjacent, and adjacency is exactly the
  // hint that would let the judge work out which rows are the same model.
  const shuffled = [...field].sort(() => Math.random() - 0.5);
  const entrants = new Map(shuffled.map((entrant, index) => [blindLabel(index), entrant]));

  // One flat list of every (entrant, run) pair, so the concurrency cap applies across the whole
  // bake-off rather than per entrant — which is what it has to do to be a cap at all.
  const jobs = [...entrants].flatMap(([label, entrant]) =>
    Array.from({ length: runs }, () => ({ label, entrant })),
  );

  // The plan, before anything is spent. It is the last chance to notice that the list is bigger
  // than intended, and it is what makes the silence that follows legible.
  say("");
  say(
    `  ${field.length} entrants × ${runs} runs = ${jobs.length} generations, ` +
    `${maxConcurrency} at a time, ${Math.round(timeoutMs / 1000)}s each before it is ` +
    `abandoned, then 1 judge call to ${judge} (${Math.round(judgeTimeoutMs / 1000)}s)`,
  );
  for (const [label, entrant] of entrants)
    say(`    ${label}  ${entrant.model}  ·  reasoning ${mode(entrant.effort)}`);
  say("");

  const started = Date.now();

  const done = await pool(
    jobs,
    maxConcurrency,
    async ({ label, entrant }) => ({
      label,
      entrant,
      attempt: await attempt(openrouter.chat(entrant.model), entrant.effort, {
        system,
        prompt: input,
        answer,
        provider,
        timeoutMs,
      }),
    }),
    ({ label, entrant, attempt: result }, completed, total) => {
      const outcome = result.ok
        ? `ok   ${num(result.tokens).padStart(8)} tok  ${usd(result.cost).padStart(12)}` +
        // The flag count, not the flags: this line is one of thirty scrolling past, and the
        // messages themselves are read in the table once the run is over.
        (result.flags.length ? `  ${result.flags.length}⚑` : "")
        : `FAIL ${result.error.split("\n")[0]!.slice(0, 200)}`;

      say(
        `  [${String(completed).padStart(String(total).length)}/${total}] ` +
        `${label}  ${secs(result.ms)}  ${outcome}   ` +
        `${entrant.model} (${mode(entrant.effort)})`,
      );
    },
  );

  const attempts = new Map<string, Attempt[]>(
    [...entrants.keys()].map((label) => [
      label,
      done.filter((job) => job.label === label).map((job) => job.attempt),
    ]),
  );

  say("");
  for (const [label, all] of attempts) {
    const entrant = entrants.get(label)!;
    const failures = all.filter((run): run is Extract<Attempt, { ok: false }> => !run.ok);

    say(
      `  ${label} = ${entrant.model} (reasoning ${mode(entrant.effort)}) — ` +
      `${all.length - failures.length}/${runs} ok`,
    );
    for (const failure of failures) say(`      ✗ ${failure.error.split("\n")[0]}`);
  }

  // The judge is one call over every answer at once, so it is the longest single wait in the run
  // and the one most likely to look like a hang. Announce it before, and time it.
  const prompt = judgePrompt({
    rules,
    input,
    criteria,
    runs,
    candidates: [...attempts].map(([label, all]) => ({ label, attempts: all })),
  });

  say("");
  say(
    `  generations done in ${secs(Date.now() - started).trim()}. Judging with ${judge} ` +
    `(~${num(Math.round(prompt.length / 4))} tokens of prompt) …`,
  );

  const judging = Date.now();
  const { verdict, cost: judgeCost } = await runJudge(
    openrouter.chat(judge),
    prompt,
    provider,
    judgeTimeoutMs,
  );

  say(`  judged in ${secs(Date.now() - judging).trim()} for ${usd(judgeCost)}.`);

  // The transcript is written BEFORE the table is printed, because the table ends by pointing at
  // it: the table is read now and gone with the scrollback, and the file is what survives the run
  // and what gets handed to whoever — or whatever — has to decide whether the prompt is the problem.
  const { spent } = spentOn(attempts, judgeCost);

  const path = transcript({
    title,
    judge,
    runs,
    system,
    input,
    criteria,
    verdict,
    entrants,
    attempts,
    spent,
  });

  say(
    table({
      title,
      judge,
      runs,
      candidates,
      verdict,
      entrants,
      attempts,
      judgeCost,
      transcript: path,
    }),
  );

  const all = [...attempts.values()].flat();

  return {
    ok: all.filter((run) => run.ok).length,
    clean: all.filter((run) => run.ok && !run.flags.length).length,
    total: all.length,
    spent,
    path,
    entrants,
    attempts,
  };
};
