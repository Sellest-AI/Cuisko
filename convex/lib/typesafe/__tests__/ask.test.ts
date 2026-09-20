import { afterEach, describe, expect, test, vi } from "vitest";

import { askTypeSafe, type ChoiceQuestion, type NoulQuestion, type ScoreQuestion } from "../ask";

/**
 * The transport, against a stubbed `fetch`.
 *
 * What is worth testing here is the PARSE, not the request: every caller treats a throw as a
 * non-event and falls back, so the only way a bad answer can do damage is by being *returned*
 * instead of thrown. Each test below is one shape of bad answer that would otherwise reach a caller
 * as a plausible value.
 *
 * All three primitives are covered because all three are claimed. A transport that parsed only
 * Choice would reject a Noul answer as unusable — the next helper's first call would fail with a
 * message about *our* schema rather than about anything it did.
 */

const CHOICE: ChoiceQuestion<"a" | "b"> = {
  type: "choice",
  instructions: "a or b?",
  criteria: { a: "the first", b: "the second" },
};

const NOUL: NoulQuestion = { type: "noul", instructions: "does it hold?" };

const SCORE: ScoreQuestion = {
  type: "score",
  instructions: "how far along?",
  criteria: ["not at all", "somewhat", "entirely"],
};

const choiceAnswer = { type: "choice", choice: "a", probabilities: { a: 0.9, b: 0.1 }, confidence: 0.95 };
const noulAnswer = { type: "noul", noul: 0.04 };
const scoreAnswer = {
  type: "score",
  score: 1.97,
  legend: { 0: "not at all", 1: "somewhat", 2: "entirely" },
  probabilities: { 0: 0, 1: 0.03, 2: 0.97 },
  confidence: 0.97,
};

const answering = (body: unknown, status = 200) => {
  const fetched = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetched);

  return fetched;
};

const bodyOf = (fetched: ReturnType<typeof answering>) => {
  const [, init] = fetched.mock.calls[0] as unknown as [string, RequestInit];

  return JSON.parse(init.body as string);
};

afterEach(() => vi.unstubAllGlobals());

describe("askTypeSafe", () => {
  test("returns one typed answer per question, under the key that asked", async () => {
    answering({ answers: { verdict: choiceAnswer } });

    const answers = await askTypeSafe("some text", { verdict: CHOICE });

    expect(answers.verdict.choice).toBe("a");
    expect(answers.verdict.confidence).toBe(0.95);
  });

  test("answers several independent questions in one call", async () => {
    answering({ answers: { pick: choiceAnswer, holds: noulAnswer, level: scoreAnswer } });

    const answers = await askTypeSafe("some text", { pick: CHOICE, holds: NOUL, level: SCORE });

    expect(answers.pick.choice).toBe("a");
    expect(answers.holds.noul).toBe(0.04);
    expect(answers.level.score).toBe(1.97);
    expect(answers.level.legend["2"]).toBe("entirely");
  });

  test("sends the state and the questions as the body, with the pinned model", async () => {
    const fetched = answering({ answers: { verdict: choiceAnswer } });

    await askTypeSafe({ input: "olive oil" }, { verdict: CHOICE });

    expect(bodyOf(fetched).model).toBe("typesafe/jev-1.13");
    expect(bodyOf(fetched).state).toEqual({ input: "olive oil" });
    expect(bodyOf(fetched).questions.verdict.criteria).toEqual(CHOICE.criteria);
  });

  test("throws when the service refuses the request", async () => {
    answering({ error: "nope" }, 402);

    await expect(askTypeSafe("x", { verdict: CHOICE })).rejects.toThrow(/answered 402/);
  });

  /**
   * The failure this file exists to make loud. An option outside the set is our contract being
   * broken, and returning it would send the caller's `switch` to a default it does not have.
   */
  test("throws when a choice is not one of the options the question named", async () => {
    answering({ answers: { verdict: { ...choiceAnswer, choice: "c" } } });

    await expect(askTypeSafe("x", { verdict: CHOICE })).rejects.toThrow(/unusably/);
  });

  /** A Noul where a Choice was asked for is the same class of break, one level up. */
  test("throws when the answer is a different primitive than the question", async () => {
    answering({ answers: { verdict: noulAnswer } });

    await expect(askTypeSafe("x", { verdict: CHOICE })).rejects.toThrow(/unusably/);
  });

  test("throws when a score lands outside the levels the question named", async () => {
    answering({ answers: { level: { ...scoreAnswer, score: 3.4 } } });

    await expect(askTypeSafe("x", { level: SCORE })).rejects.toThrow(/unusably/);
  });

  test("throws when the question came back unanswered", async () => {
    answering({ answers: { somethingElse: choiceAnswer } });

    await expect(askTypeSafe("x", { verdict: CHOICE })).rejects.toThrow(/unusably/);
  });

  test("throws when the body carries no answers map at all", async () => {
    answering({ choices: [{ message: { content: "a" } }] });

    await expect(askTypeSafe("x", { verdict: CHOICE })).rejects.toThrow(/no answers map/);
  });
});
