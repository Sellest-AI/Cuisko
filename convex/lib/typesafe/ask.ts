import { ConvexError } from "convex/values";
import * as z from "zod/v4";

import { env } from "@convex/env";

/**
 * One request to TypeSafe, and nothing about food.
 *
 * TypeSafe's models answer *typed questions* rather than generating text: a question declares the
 * shape of its own answer, and the reply is that shape plus the probabilities behind it. There is no
 * prose to parse and no schema to coax out of a completion, which is why this file is short and
 * `agent/utils/parseModelOutput.ts` is not.
 *
 * It is deliberately domain-free — a question-shaped fetch. The caller owns the question, the
 * criteria and what an answer means; more assistant helpers are coming and they add a file under
 * `functions/assistant/`, not a branch in here.
 *
 * **Reached through OpenRouter and not `api.typesafe.ai`**, so the key we already hold pays for it
 * and no second secret enters `env.ts`. The path is not `/chat/completions`: the body is
 * `{ model, state, questions }`, which no chat client can express, so this is a plain `fetch` rather
 * than the `@openrouter/ai-sdk-provider` the agent uses.
 */

/** The endpoint that takes a `state` and a question map rather than a message list. */
const ENDPOINT = "https://openrouter.ai/api/v1/systemone";

/**
 * Pinned, not `jev-latest`. A caller thresholds its answers against a floor calibrated on one
 * model's calibration, and an alias that moves under us moves that floor with no diff anywhere.
 */
const MODEL = "typesafe/jev-1.13";

/**
 * Short, because the caller is a shopper watching a spinner rather than a pipeline. A judgment that
 * has not landed in six seconds is one we would rather answer without: every caller of this file
 * has a fallback, and none of them has a user who will wait.
 */
const TIMEOUT_MS = 6_000;

/**
 * The three kinds of question, and the three shapes of answer.
 *
 * All three are supported because the transport claims to be domain-free, and one that silently
 * rejected two thirds of the API would not be — the next helper would have to fork it. Which to
 * reach for:
 *
 *   - **Choice** — one of a named set. The distribution compares the options against each other.
 *   - **Noul** — whether a condition holds, as the probability of yes. Use one per label when
 *     several could be true at once; a Choice would force them to compete.
 *   - **Score** — a position along an ordered dimension whose levels you describe.
 */

/**
 * One of the options named in `criteria`. The keys ARE the option set, and the model reads them.
 *
 * A description may be `null` when the key says everything: an option named after the thing it is
 * ("balsamic vinegar") has nothing a sentence would add, and one written anyway is a hint the
 * caller slipped in rather than a fact the model was given.
 */
export type ChoiceQuestion<Option extends string> = {
  type: "choice";
  /** What to decide. An object holds the question in one field and the data it refers to in others. */
  instructions: string | object;
  criteria: Record<Option, string | object | null>;
};

/** A yes/no question. `criteria` is optional — describing both poles sharpens it. */
export type NoulQuestion = {
  type: "noul";
  instructions: string | object;
  criteria?: { true: string | object; false: string | object };
};

/** A position along an ordered dimension. `criteria` is the levels, lowest first. */
export type ScoreQuestion = {
  type: "score";
  instructions: string | object;
  criteria: readonly (string | object)[];
};

export type Question = ChoiceQuestion<string> | NoulQuestion | ScoreQuestion;

export type ChoiceAnswer<Option extends string> = {
  type: "choice";
  choice: Option;
  probabilities: Record<Option, number>;
  /**
   * How concentrated the distribution is, NOT how likely the answer is to be true. Two options that
   * are both acceptable split the mass and read as unconfident, so threshold on this only where the
   * options are genuinely exclusive.
   */
  confidence: number;
};

/**
 * **No `confidence`, and that is the primitive rather than an omission.** The probability of yes IS
 * the answer, so there is no second axis to report: 0.5 means yes and no are equally likely, not
 * that the model is unsure at medium intensity. Threshold `noul` itself.
 */
export type NoulAnswer = {
  type: "noul";
  noul: number;
};

export type ScoreAnswer = {
  type: "score";
  /** Interpolated across the levels, so it lands between them: `2.97` is "nearly the top level". */
  score: number;
  /** The levels as the model was given them, keyed by index — what `score` and `probabilities` refer to. */
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
};

/**
 * Which answer a question gets back, discriminated on `type` FIRST.
 *
 * The order is load-bearing: a `NoulQuestion`'s `{ true, false }` criteria structurally satisfies
 * `ChoiceQuestion<"true" | "false">`, so matching on the criteria shape before the discriminant
 * would type every Noul as a Choice.
 */
type AnswerOf<Q> = Q extends { type: "choice" }
  ? Q extends ChoiceQuestion<infer Option>
  ? ChoiceAnswer<Option>
  : never
  : Q extends { type: "noul" }
  ? NoulAnswer
  : Q extends { type: "score" }
  ? ScoreAnswer
  : never;

/** The answers map, each entry typed by the question it answers. */
type Answers<Q extends Record<string, Question>> = { [Key in keyof Q]: AnswerOf<Q[Key]> };

const envelopeSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
});

/**
 * Parsed against what the CALLER asked, not against `z.unknown()`.
 *
 * A Choice answer outside the option set, or a Noul where a Score was asked for, is not a value to
 * branch on — it is this file's contract being broken, and the caller's `switch` would fall through
 * to a default it does not have. Better to throw: every caller has a fallback, and none of them
 * wants a plausible wrong answer.
 */
const answerSchema = (question: Question) => {
  switch (question.type) {
    case "choice": {
      const options = Object.keys(question.criteria) as [string, ...string[]];

      return z.object({
        type: z.literal("choice"),
        choice: z.enum(options),
        probabilities: z.record(z.string(), z.number()),
        confidence: z.number().min(0).max(1),
      });
    }
    case "noul":
      return z.object({
        type: z.literal("noul"),
        noul: z.number().min(0).max(1),
      });
    case "score":
      return z.object({
        type: z.literal("score"),
        // Bounded by the levels the question named, so a legend that came back out of step with the
        // criteria fails here rather than indexing off the end of the caller's own array.
        score: z.number().min(0).max(question.criteria.length - 1),
        legend: z.record(z.string(), z.string()),
        probabilities: z.record(z.string(), z.number()),
        confidence: z.number().min(0).max(1),
      });
  }
};

const unreachable = (message: string) =>
  new ConvexError({ code: "EXTERNAL_SERVICE_ERROR" as const, message });

/**
 * A state and a map of questions → one answer per question, under the same keys.
 *
 * **Ask independent questions in one call.** They are evaluated in parallel and cannot see each
 * other's answers, so a second call buys nothing unless an answer decides what to ask next — and a
 * question whose answer you may end up ignoring is often still worth asking here rather than in a
 * second round trip.
 *
 * Question keys are for our code only: they are not sent to the model and take no part in the
 * judgment, so every word the model needs has to be in `instructions` or `criteria`.
 *
 * Throws on a timeout, a non-200, or a body that does not answer what was asked. Callers catch it —
 * a judgment is an improvement over a heuristic, never a dependency of one.
 */
export const askTypeSafe = async <Q extends Record<string, Question>>(
  state: unknown,
  questions: Q,
): Promise<Answers<Q>> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, state, questions }),
      signal: controller.signal,
    });

    if (!response.ok)
      throw unreachable(`TypeSafe answered ${response.status}: ${await response.text()}`);

    const envelope = envelopeSchema.safeParse(await response.json());
    if (!envelope.success)
      throw unreachable(`TypeSafe returned no answers map: ${envelope.error.message}`);

    // Built by walking the questions rather than the response, so a question that came back
    // unanswered fails here instead of arriving at the caller as `undefined`.
    return Object.fromEntries(
      Object.entries(questions).map(([key, question]) => {
        const parsed = answerSchema(question).safeParse(envelope.data.answers[key]);

        if (!parsed.success)
          throw unreachable(`TypeSafe answered "${key}" unusably: ${parsed.error.message}`);

        return [key, parsed.data];
      }),
    ) as Answers<Q>;
  } catch (error) {
    if (controller.signal.aborted) throw unreachable("TypeSafe took too long to answer");
    throw error;
  } finally {
    clearTimeout(timer);
  }
};
