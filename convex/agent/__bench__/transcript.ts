"use node"
/**
 * The whole bake-off, written to one file another model can be handed.
 *
 * The table a run prints answers "which model do I ship". This answers a different question, and
 * it is the one you ask when the table is disappointing across the WHOLE field: is the fault the
 * models, or is it the prompt and the schema we gave them? Nobody can answer that from a ranking —
 * it needs the instructions, the input, what every candidate actually returned, what code proved
 * wrong, and what the judge said, side by side. That is more than a terminal can hold and more
 * than a person wants to re-paste by hand, so it goes to disk.
 *
 * The reader is a model, not a person. So the file un-blinds the letters — the shuffle exists to
 * keep the JUDGE honest during the run, and it is over — and it opens by saying what it wants
 * done with it, because a downstream model given a wall of JSON and no question will summarise it.
 *
 * Written under `runs/`, which is gitignored: these are minutes of real spend, worth keeping until
 * the prompt is fixed and worth nothing after.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { meanCost, median, mode, num, succeeded, toolUseLines, usd } from "./format";
import type { Verdict } from "./judge";
import type { Attempt, Entrant } from "./types";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * A filename-safe instant, local time.
 *
 * `toISOString()` would be shorter and wrong twice over: the colons in it are illegal in a Windows
 * filename, and UTC is not the clock the person reading the folder was working against.
 */
const _stamp = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");

  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
  );
};

/** Structured output as JSON, free text as itself — the same rule the judge prompt uses. */
const _render = (output: unknown) =>
  typeof output === "string" ? output : JSON.stringify(output, null, 2);

/** A fenced block, with the language the content actually is. */
const _fence = (body: string, language = "") => `\`\`\`${language}\n${body}\n\`\`\``;

/** One run, un-blinded, with the deterministic findings attached to it. */
const _run = (attempt: Attempt, index: number) => {
  const tools = toolUseLines(attempt.toolUses);
  const toolBlock = tools ? [...tools, ""] : [];

  if (!attempt.ok)
    return [`#### Run ${index + 1} — FAILED after ${attempt.ms} ms`, "", ...toolBlock, _fence(attempt.error)];

  return [
    `#### Run ${index + 1} — ${num(attempt.ms)} ms · ${num(attempt.tokens)} tokens ` +
    `(${num(attempt.reasoning)} reasoning) · ${usd(attempt.cost)}`,
    "",
    ...(attempt.flags.length
      ? [
        "Automated checks flagged this run — these were proved by code, not judged:",
        "",
        ...attempt.flags.map((flag) => `- ${flag}`),
        "",
      ]
      : ["Automated checks: clean.", ""]),
    ...toolBlock,
    _fence(_render(attempt.output), typeof attempt.output === "string" ? "" : "json"),
  ];
};

/**
 * Write the dossier and return its path.
 *
 * Everything it needs is already in the caller's hands when the table is printed — this adds no
 * call and costs nothing but the write, which is why it is not opt-in.
 */
export const transcript = (options: {
  title: string;
  judge: string;
  runs: number;
  system: string;
  input: string;
  criteria: readonly string[];
  verdict: Verdict;
  entrants: Map<string, Entrant>;
  attempts: Map<string, Attempt[]>;
  spent: number;
}) => {
  const { title, judge, runs, system, input, criteria, verdict, entrants, attempts, spent } =
    options;

  const ranked = [...verdict.rows].sort((a, b) => a.rank - b.rank);
  const named = (label: string) => {
    const entrant = entrants.get(label);

    return entrant ? `${entrant.model} · reasoning ${mode(entrant.effort)}` : `unknown (${label})`;
  };

  const body = [
    `# ${title} bake-off — ${_stamp()}`,
    "",
    `${entrants.size} models × ${runs} runs, judged by ${judge}, ${usd(spent)} spent.`,
    "",
    "## What to do with this file",
    "",
    "A bake-off asks which model to ship. This file exists for the case where that question has " +
    "the wrong answer for every candidate — where the field is uniformly weak, or where the " +
    "same fault appears under several unrelated models. When that happens the model is rarely " +
    "the variable: the instructions below asked for something ambiguous, contradictory or " +
    "impossible, or the schema left room for the shape that keeps coming back wrong.",
    "",
    "So read it as evidence about the PROMPT, not about the models. Concretely:",
    "",
    "1. Find the faults that recur ACROSS candidates, and ignore the ones a single model made — " +
    "the first is a specification defect, the second is a model defect.",
    "2. For each recurring fault, find the sentence in the instructions that was supposed to " +
    "prevent it, and quote it. If there is no such sentence, that is the finding.",
    "3. Say whether the fix is a change to the instructions, a change to the output schema, or " +
    "neither — some faults really are the model, and saying so is a valid answer.",
    "4. Propose the edit as replacement text for the specific lines, not as advice.",
    "",
    "The judge's notes are one model's opinion and may be wrong. The lines marked as flagged by " +
    "automated checks are not — those were verified in code before the judge saw them.",
    "",
    "Where the candidates had tools, each run lists its tool calls before its answer: what it " +
    "looked up, and what came back. Read them as the run's reasoning made visible — a wrong answer " +
    "built on a search that returned the right row is a different fault from one that never searched.",
    "",
    "## The instructions the candidates were given",
    "",
    "This is the system prompt, verbatim. It is the thing under suspicion.",
    "",
    _fence(system),
    "",
    "## What they were given to work from",
    "",
    _fence(input),
    "",
    "## How they were ranked",
    "",
    "Heaviest first. The judge was given these, plus consistency across runs and speed as a " +
    "tie-break, which the harness appends.",
    "",
    ...criteria.map((criterion, index) => `${index + 1}. ${criterion}`),
    "",
    "## The verdict",
    "",
    verdict.verdict,
    "",
    ...ranked.flatMap((row) => [
      `### #${row.rank} — ${named(row.label)} — ${row.score}/10`,
      "",
      row.note,
      "",
      `Across runs: ${row.consistency}`,
      "",
    ]),
    "## Every answer",
    "",
    ...ranked.flatMap((row) => {
      const all = attempts.get(row.label) ?? [];
      const ok = succeeded(all);

      return [
        `### #${row.rank} — ${named(row.label)}`,
        "",
        `${ok.length}/${all.length} ok · ~${num(median(ok.map((a) => a.ms)))} ms · ` +
        `~${num(median(ok.map((a) => a.tokens)))} tokens · ${usd(meanCost(ok))}/run`,
        "",
        ...all.flatMap((attempt, index) => [..._run(attempt, index), ""]),
      ];
    }),
  ].join("\n");

  const file = join(HERE, "runs", `${title}_${_stamp()}.md`);

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body, "utf8");

  return relative(process.cwd(), file);
};
