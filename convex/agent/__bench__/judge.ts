/**
 * The ranking call.
 *
 * The verdict SCHEMA is the harness's and is not caller-supplied: the table renderer reads these
 * exact fields, so a bake-off that brought its own schema would have to bring its own table too,
 * and the folder would stop being a framework. What the caller does supply is the part that is
 * actually domain knowledge — the rules the candidates were given, and the criteria to weigh them
 * on.
 */
import { generateText, Output } from "ai";
import * as z from "zod/v4";

import { reportedCost, routing, type Chat } from "./provider";
import type { Attempt, ProviderRouting } from "./types";

export const verdictSchema = z.object({
  rows: z
    .array(
      z.object({
        label: z
          .string()
          .describe(`The letter of the candidate this row is about — "A", "B", "C"…`),
        rank: z.number().describe("1 is best. No ties: break them on whichever you would ship."),
        score: z
          .number()
          .describe("Out of 10. Absolute quality, so two bad candidates both score low."),
        note: z
          .string()
          .describe(
            "One or two sentences, and they must be SPECIFIC: name the rule broken and the line " +
            `that broke it, never "good structure" or "followed the prompt well".`,
          ),
        consistency: z
          .string()
          .describe(
            "What changed between this candidate's runs, in one clause. A candidate that is " +
            "excellent once and wrong twice is worse than one that is good three times — say " +
            "which this is.",
          ),
      }),
    )
    .describe("One row per candidate letter, best first. Every letter gets a row."),
  verdict: z
    .string()
    .describe(
      "Two or three sentences: which one to ship, and the single most important reason. If none " +
      "is good enough, say that instead — a bake-off is allowed to have no winner.",
    ),
});

export type Verdict = z.infer<typeof verdictSchema>;

/** Structured output as JSON, free text as itself — a quoted, escaped paragraph reads as noise. */
const _render = (output: unknown) =>
  typeof output === "string" ? output : JSON.stringify(output, null, 2);

/** One run, as the judge sees it: what came back, and what code already proved wrong with it. */
const _run = (label: string, index: number, attempt: Attempt) => {
  if (!attempt.ok)
    return `### ${label}, run ${index + 1} — FAILED after ${attempt.ms} ms\n${attempt.error}`;

  return [
    `### ${label}, run ${index + 1} (${attempt.ms} ms)`,
    _render(attempt.output),
    ...(attempt.flags.length
      ? ["Automated checks flagged this run:", ...attempt.flags.map((flag) => `- ${flag}`)]
      : []),
  ].join("\n");
};

/**
 * Everything the judge sees, in one prompt.
 *
 * The candidates arrive under blind letters and in shuffled order, and the paragraph about modes
 * is not optional politeness — without it a judge that spots two near-identical answers concludes
 * one copied the other rather than that it is one model at two efforts.
 */
export const judgePrompt = (options: {
  rules: string;
  input: string;
  criteria: readonly string[];
  runs: number;
  candidates: { label: string; attempts: Attempt[] }[];
}) => {
  const { rules, input, criteria, runs, candidates } = options;
  const flagged = candidates.some(({ attempts }) =>
    attempts.some((attempt) => attempt.ok && attempt.flags.length),
  );

  return [
    `${candidates.length} candidates were given the same input and the same rules. Rank them.`,
    "",
    "Some candidates may be the same underlying model run at a different reasoning setting, which " +
    "is why two of them can read almost identically. You are not told which, and you must not " +
    "guess: judge only what is in front of you.",
    "",
    "# The rules they were given",
    "",
    rules,
    "",
    "# What they were given to work from",
    "",
    input,
    "",
    "# What each candidate returned",
    "",
    ...candidates.map(({ label, attempts }) =>
      [`## Candidate ${label}`, ...attempts.map((attempt, index) => _run(label, index, attempt))]
        .join("\n\n"),
    ),
    "",
    "# How to weigh them",
    "",
    "In this order, heaviest first:",
    // The caller's criteria first, then the two the harness owns because it is the harness that
    // knows how many runs there were and that speed was measured at all.
    ...[
      ...criteria,
      `Consistency across the ${runs} runs.`,
      "Speed, last and only as a tie-break.",
    ].map((criterion, index) => `${index + 1}. ${criterion}`),
    "",
    "A failed run counts against its candidate as heavily as a bad one — the tool cannot ship a " +
    "model that throws.",
    // Only when there is something flagged. A paragraph about evidence that does not exist invites
    // the judge to go looking for it and to invent it when it finds nothing.
    ...(flagged
      ? [
        "",
        "Where a run is marked as flagged by automated checks, those findings were verified by " +
        "code before you saw them. They are facts, not opinions: weigh them as hard evidence " +
        "under the criteria above, do not argue with them, and do not credit a candidate for " +
        "something a check has already contradicted.",
      ]
      : []),
  ].join("\n");
};

/**
 * The judge is one call over every candidate at once, so it is the longest single wait in the run
 * and the single most expensive call on a big field — which is why its cost comes back with it and
 * lands in the total.
 */
export const judge = async (model: Chat, prompt: string, provider?: ProviderRouting) => {
  const result = await generateText({
    model,
    output: Output.object({ schema: verdictSchema }),
    system:
      "You are ranking model outputs. You are strict, you cite the line you are objecting to, " +
      "and you never praise a candidate for something every candidate did.",
    prompt,
    providerOptions: routing("high", provider),
    maxRetries: 4,
  });

  return { verdict: result.output, cost: reportedCost(result.finalStep.providerMetadata) };
};
