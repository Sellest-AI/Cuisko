"use node"
/**
 * The half of a bake-off that spends: the field under blind letters, then every (entrant, run)
 * generation of one input, behind one concurrency cap. `runBakeOff` calls it once; `runSuite` calls
 * it once per case, with the same letters, so the one judge reads "A" as the same model throughout.
 */
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

import { label as blindLabel, entrantName, num, say, secs, usd } from "./format";
import { pool } from "./pool";
import { attempt } from "./provider";
import type { Answer, Attempt, BakeOff, Candidate, Entrant, ProviderRouting } from "./types";

export const DEFAULTS = {
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

export const openrouter = () => createOpenRouter({ apiKey: _openrouterKey() });

export type OpenRouter = ReturnType<typeof openrouter>;

/**
 * Every candidate at each of its modes, under a letter.
 *
 * Letters assigned by shuffle, so a judge with a positional bias — and they all have one — does
 * not hand it to whichever entrant happens to be first. It matters most with several modes per
 * model: unshuffled, a model's modes would always land adjacent, and adjacency is exactly the
 * hint that would let the judge work out which rows are the same model.
 */
export const blindField = (candidates: readonly Candidate[]): Map<string, Entrant> => {
  const field: Entrant[] = candidates.flatMap(({ name, modes, provider: pinned }) =>
    modes.map((effort) => ({ model: name, effort, ...(pinned && { provider: pinned }) })),
  );
  const shuffled = [...field].sort(() => Math.random() - 0.5);

  return new Map(shuffled.map((entrant, index) => [blindLabel(index), entrant]));
};

/**
 * The plan, before anything is spent. It is the last chance to notice that the list is bigger
 * than intended, and it is what makes the silence that follows legible. `then` is what follows
 * the generations: the judge call, or nothing.
 */
export const announce = (options: {
  entrants: Map<string, Entrant>;
  /** Per entrant, per input. */
  runs: number;
  /** 1 for a bake-off, the case count for a suite. */
  inputs: number;
  maxConcurrency: number;
  timeoutMs: number;
  then: string;
}) => {
  const { entrants, runs, inputs, maxConcurrency, timeoutMs, then } = options;
  const generations = entrants.size * runs * inputs;

  say("");
  say(
    `  ${entrants.size} entrants × ${runs} runs` +
    (inputs > 1 ? ` × ${inputs} inputs` : "") +
    ` = ${generations} generations, ` +
    `${maxConcurrency} at a time, ${Math.round(timeoutMs / 1000)}s each before it is ` +
    `abandoned${then}`,
  );
  for (const [label, entrant] of entrants)
    say(`    ${label}  ${entrantName(entrant, "  ·  ")}`);
  say("");
};

/**
 * Every entrant's runs on one input, then a line per entrant: how many came back, and why the
 * others did not.
 */
export const generate = async <Raw, Parsed>(options: {
  openrouter: OpenRouter;
  entrants: Map<string, Entrant>;
  runs: number;
  system: string;
  prompt: string;
  answer?: Answer<Raw, Parsed>;
  tools?: BakeOff<Raw, Parsed>["tools"];
  provider?: ProviderRouting;
  maxConcurrency: number;
  timeoutMs: number;
}): Promise<Map<string, Attempt[]>> => {
  const { openrouter: client, entrants, runs, system, prompt, answer, tools, provider, maxConcurrency, timeoutMs } =
    options;

  // One flat list of every (entrant, run) pair, so the concurrency cap applies across the whole
  // input rather than per entrant — which is what it has to do to be a cap at all.
  const jobs = [...entrants].flatMap(([label, entrant]) =>
    Array.from({ length: runs }, () => ({ label, entrant })),
  );

  const done = await pool(
    jobs,
    maxConcurrency,
    async ({ label, entrant }) => ({
      label,
      entrant,
      attempt: await attempt(client.chat(entrant.model), entrant.effort, {
        system,
        prompt,
        answer,
        tools,
        provider: { ...provider, ...entrant.provider },
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
        entrantName(entrant),
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
    const flagged = all.filter((run) => run.ok && run.flags.length).length;

    say(
      `  ${label} = ${entrantName(entrant)} — ` +
      `${all.length - failures.length}/${runs} ok` +
      (flagged ? `, ${flagged} flagged` : ""),
    );
    for (const failure of failures) say(`      ✗ ${failure.error.split("\n")[0]}`);
  }

  return attempts;
};

/** What a caller asserts on: runs that came back, and those no check flagged. */
export const counts = (attempts: Map<string, Attempt[]>) => {
  const all = [...attempts.values()].flat();

  return {
    ok: all.filter((run) => run.ok).length,
    clean: all.filter((run) => run.ok && !run.flags.length).length,
    total: all.length,
  };
};
