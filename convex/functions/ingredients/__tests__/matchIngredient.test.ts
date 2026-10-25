import { afterEach, describe, expect, test, vi } from "vitest";

import type { ChoiceAnswer } from "@convex/lib/typesafe/ask";

import type { LookupHit } from "../lookup/lookupHit";
import {
  aliasWorthSaving,
  dictionaryOf,
  judgeAlias,
  judgeMatch,
  judgeMeasured,
  matchIngredient,
  matchState,
  NONE,
  optionsFor,
  pickMeasuredFood,
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

describe("dictionaryOf", () => {
  const _curated: LookupHit = {
    source: "foodComposition",
    names: { en: ["lemon juice"], fr: ["jus de citron"] },
  };

  /**
   * The ranker sees the taxonomy's answer, which is the whole of the wrong-link fix: `jus de citron`
   * was judged against a `Jus d'orange` row on the words alone, and linked.
   */
  test("states what a curated source filed the term under, per language", () => {
    expect(dictionaryOf([_curated])).toEqual({ en: ["lemon juice"], fr: ["jus de citron"] });
  });

  /**
   * A searched source answers a keyword query with whatever ranked highest — USDA replies to
   * `pâte de pistache` with a guava pastry. Repeated to the ranker as what the term IS, that
   * argues for the wrong answer rather than merely adding noise.
   */
  test("says nothing about a source that reached its answer by searching", () => {
    const searched: LookupHit = {
      source: "foodComposition",
      names: { en: ["Pastry, Pastelitos de Guava"] },
      searched: true,
    };

    expect(dictionaryOf([searched])).toEqual({});
  });

  test("keeps three spellings a language, not a wall of synonyms", () => {
    const wordy: LookupHit = { source: "foodComposition", names: { en: ["a", "b", "c", "d"] } };

    expect(dictionaryOf([wordy])).toEqual({ en: ["a", "b", "c"] });
  });
});

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

describe("pickMeasuredFood", () => {
  const ASKED = { text: "pesto rouge", locale: "fr" as const };

  const BASIL = {
    measuredAs: [{ name: "Pesto alla genovese", locale: "fr" as const }],
    nutrition: { calories: 520 },
  };
  const RED = {
    measuredAs: [
      { name: "Red pesto", locale: "en" as const },
      { name: "Pesto rouge", locale: "fr" as const },
    ],
    nutrition: { calories: 310 },
  };

  /** The keyword search ranked the basil jar first; its figures are what the hit carries. */
  const SEARCHED: LookupHit = {
    source: "openFoodFacts",
    names: { fr: ["Pesto alla genovese", "Pesto rouge"] },
    searched: true,
    nutrition: BASIL.nutrition,
    measuredAs: BASIL.measuredAs,
    candidates: [BASIL, RED],
  };

  test("keeps the figures of the result Jev picked, whatever the search ranked first", async () => {
    answering({ match: picked("Pesto rouge", 0.95) });

    const judged = await pickMeasuredFood(ASKED, SEARCHED);

    expect(judged).toMatchObject({ nutrition: RED.nutrition, measuredAs: RED.measuredAs, judged: true });
    expect(judged).not.toHaveProperty("candidates");
  });

  /** The row writer reads the source's spellings as what it calls the food, so Jev's pick leads. */
  test("puts the picked result's titles first among the source's spellings", async () => {
    answering({ match: picked("Pesto rouge", 0.95) });

    const judged = await pickMeasuredFood(ASKED, { ...SEARCHED, untagged: ["Pesto", "Pesto rouge"] });

    expect(judged.names.fr).toEqual(["Pesto rouge", "Pesto alla genovese"]);
    // A title the source labelled with a language leads that language only.
    expect(judged.untagged).toEqual(["Pesto", "Pesto rouge"]);
  });

  /** Jev reads each result by its title in the shopper's language, the way they typed it. */
  test("offers each result to Jev under its title in the shopper's language", async () => {
    const fetched = answering({ match: picked(NONE, 1) });

    await pickMeasuredFood(ASKED, SEARCHED);

    expect(Object.keys(sentBody(fetched).questions.match.criteria)).toEqual([
      NONE,
      "Pesto alla genovese",
      "Pesto rouge",
    ]);
  });

  /**
   * The catalog's question calls a broader kind or a qualified title another food, and a search page
   * is all qualified titles: asked it, every model refused `egg` its "Egg, whole, raw, fresh".
   */
  test("asks which result measured the food, not the catalog's same-item question", async () => {
    const fetched = answering({ match: picked(NONE, 1) });

    await pickMeasuredFood(ASKED, SEARCHED);
    await judgeMatch({ ...ASKED, candidates: CANDIDATES });

    const [page, catalog] = [0, 1].map((call) => {
      const [, init] = fetched.mock.calls[call] as unknown as [string, RequestInit];
      return JSON.parse(init.body as string).questions.match;
    });
    expect(page.instructions.question).toMatch(/measured/);
    expect(page.instructions).not.toEqual(catalog.instructions);
    expect(page.criteria[NONE]).not.toEqual(catalog.criteria[NONE]);
  });

  test("drops every figure when Jev says none of the results is the food", async () => {
    answering({ match: picked(NONE, 1) });

    const judged = await pickMeasuredFood(ASKED, SEARCHED);

    expect(judged.nutrition).toBeUndefined();
    expect(judged.measuredAs).toEqual([]);
    expect(judged.names).toEqual(SEARCHED.names);
  });

  /** Unjudged figures are the bug this exists to end; the model fills the gap instead. */
  test("drops the figures, and does not throw, when TypeSafe cannot be reached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    answering({}, 503);

    const judged = await pickMeasuredFood(ASKED, SEARCHED);

    expect(judged.nutrition).toBeUndefined();
    expect(judged.judged).toBe(true);
  });

  /** The manual tests compare models through these judges; a name dropped here measures the pin. */
  test("asks every judge on the model a caller names", async () => {
    const fetched = answering({ match: picked(NONE, 1), alias: { type: "noul", noul: 0.9 } });
    const input = { ...ASKED, candidates: CANDIDATES, model: "liquid/d1-ultra" };

    await judgeMatch(input);
    await judgeMeasured(input);
    await judgeAlias(input, "cider vinegar");

    const models = (fetched.mock.calls as unknown as [string, RequestInit][])
      .map(([, init]) => JSON.parse(init.body as string).model);
    expect(models).toEqual(["liquid/d1-ultra", "liquid/d1-ultra", "liquid/d1-ultra"]);
  });

  test("leaves a curated hit alone and asks Jev nothing about it", async () => {
    const fetched = answering({ match: picked(NONE, 1) });
    const curated: LookupHit = {
      source: "foodComposition",
      names: { en: ["Carrot"] },
      nutrition: { calories: 41 },
    };

    expect(await pickMeasuredFood(ASKED, curated)).toBe(curated);
    expect(fetched).not.toHaveBeenCalled();
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
