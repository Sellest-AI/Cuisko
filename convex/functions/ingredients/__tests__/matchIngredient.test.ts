import { afterEach, describe, expect, test, vi } from "vitest";

import type { ChoiceAnswer } from "@convex/lib/typesafe/ask";

import {
  aliasWorthSaving,
  judgeMatch,
  matchIngredient,
  matchState,
  NONE,
  optionsFor,
  readMatchAnswer,
} from "../matchIngredient";

/**
 * What we DO with Jev's answer, against a stubbed `fetch`. What Jev says is measured by
 * `matchIngredient.manual.test.ts`; this pins the floor, the option keys and the failure paths,
 * because those decide whether a wrong food reaches a shopping list whatever the model answers.
 */

const CANDIDATES = [
  { id: "k1", name: "white vinegar" },
  { id: "k2", name: "balsamic vinegar" },
  { id: "k3", name: "cider vinegar" },
];

const picked = (choice: string, probability: number): ChoiceAnswer<string> => ({
  type: "choice",
  choice,
  probabilities: { [choice]: probability },
  confidence: probability,
});

const answering = (answers: Record<string, unknown>, status = 200) => {
  const fetched = vi.fn(async () => new Response(JSON.stringify({ answers }), { status }));
  vi.stubGlobal("fetch", fetched);

  return fetched;
};

const sentBody = (fetched: ReturnType<typeof answering>) => {
  const [, init] = fetched.mock.calls[0] as unknown as [string, RequestInit];

  return JSON.parse(init.body as string);
};

afterEach(() => vi.unstubAllGlobals());

describe("optionsFor", () => {
  test("names each option after its candidate, in list order", () => {
    expect(optionsFor(CANDIDATES)).toEqual(["white vinegar", "balsamic vinegar", "cider vinegar"]);
  });

  /** A map cannot hold a key twice, so the second row would vanish from the options silently. */
  test("keeps two candidates that share a name apart", () => {
    expect(optionsFor([{ id: "a", name: "sugar" }, { id: "b", name: "Sugar" }]))
      .toEqual(["sugar", "Sugar (2)"]);
  });

  test("never lets a candidate stand in for the no-match answer", () => {
    expect(optionsFor([{ id: "a", name: "None" }])).toEqual(["None (1)"]);
  });
});

describe("matchState", () => {
  test("leaves the dictionary out when nothing looked the term up", () => {
    expect(matchState({ text: "kaki", locale: "fr", dictionary: {} }))
      .toEqual({ shopperTyped: "kaki", language: "French" });
  });

  test("states what a dictionary filed the term under, by language name", () => {
    expect(matchState({ text: "cider vinegar", locale: "en", dictionary: { fr: ["vinaigre de cidre"] } }))
      .toEqual({
        shopperTyped: "cider vinegar",
        language: "English",
        foodDictionary: { French: ["vinaigre de cidre"] },
      });
  });
});

describe("readMatchAnswer", () => {
  test("links the candidate the pick names", () => {
    expect(readMatchAnswer(picked("cider vinegar", 0.95), CANDIDATES)).toBe(CANDIDATES[2]);
  });

  test("links nothing when the answer is none", () => {
    expect(readMatchAnswer(picked(NONE, 0.99), CANDIDATES)).toBeUndefined();
  });

  /** Below the floor the link is discarded and a row is written: one generation, never a wrong food. */
  test("links nothing when the pick is not probable enough", () => {
    expect(readMatchAnswer(picked("balsamic vinegar", 0.79), CANDIDATES)).toBeUndefined();
  });

  /**
   * TypeSafe's `confidence` is how concentrated the distribution is, not how likely the pick is, so
   * a pick carrying half the mass must not pass on a high concentration figure.
   */
  test("thresholds the pick's own probability, never the confidence", () => {
    const split = { ...picked("balsamic vinegar", 0.5), confidence: 0.95 };

    expect(readMatchAnswer(split, CANDIDATES)).toBeUndefined();
  });
});

describe("judgeMatch", () => {
  test("offers none and every candidate, with no description written for a candidate", async () => {
    const fetched = answering({ match: picked(NONE, 1) });

    await judgeMatch({ text: "cider vinegar", locale: "en", candidates: CANDIDATES });

    const { criteria } = sentBody(fetched).questions.match;
    expect(Object.keys(criteria)).toEqual([NONE, ...optionsFor(CANDIDATES)]);
    expect(criteria["cider vinegar"]).toBeNull();
    expect(typeof criteria[NONE]).toBe("string");
  });
});

describe("matchIngredient", () => {
  /** "No match" means "write a new row", so an outage must not read as one. */
  test("throws when TypeSafe cannot be reached, rather than answering no match", async () => {
    answering({}, 503);

    await expect(matchIngredient({ text: "cider vinegar", locale: "en", candidates: CANDIDATES }))
      .rejects.toThrow();
  });
});

describe("aliasWorthSaving", () => {
  const input = { text: "échalote", locale: "fr" as const };

  test("stores a word the model is sure of", async () => {
    answering({ alias: { type: "noul", noul: 0.93 } });

    expect(await aliasWorthSaving(input, "shallot")).toBe(true);
  });

  test("stores nothing below the floor", async () => {
    answering({ alias: { type: "noul", noul: 0.4 } });

    expect(await aliasWorthSaving(input, "shallot")).toBe(false);
  });

  /** The match is already decided; losing the alias costs one call next time, never the link. */
  test("stores nothing, and does not throw, when TypeSafe cannot be reached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    answering({}, 500);

    expect(await aliasWorthSaving(input, "shallot")).toBe(false);
  });
});
