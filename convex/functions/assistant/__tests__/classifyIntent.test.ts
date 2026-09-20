import { afterEach, describe, expect, test, vi } from "vitest";

import { CONFIDENCE_FLOOR, classifyIntent, readIntentAnswer } from "../classifyIntent";

/**
 * The mapping and the floor, pinned without a live call.
 *
 * What the model says is its business — `classifyIntent.manual.test.ts` measures that, and is what
 * `CONFIDENCE_FLOOR` is set from. What we DO with an answer is this file's business: which kind each
 * option becomes, what happens below the floor, and the promise that nothing in here can throw at
 * the navigation bar.
 */

const answer = (choice: "ingredient" | "recipe" | "request", confidence: number) => ({
  type: "choice" as const,
  choice,
  probabilities: { ingredient: 0, recipe: 0, request: 0, [choice]: confidence },
  confidence,
});

const answering = (body: unknown, status = 200) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

afterEach(() => vi.unstubAllGlobals());

describe("readIntentAnswer", () => {
  test("a food becomes an ingredient", () => {
    expect(readIntentAnswer(answer("ingredient", 0.99))).toEqual({ kind: "ingredient" });
  });

  test("a dish becomes a recipe", () => {
    expect(readIntentAnswer(answer("recipe", 0.99))).toEqual({ kind: "recipe" });
  });

  /** `reason: "model"` and not `"sentence"`: a route that reads wrong has to name the rule that chose it. */
  test("a request becomes a chat that says the model chose it", () => {
    expect(readIntentAnswer(answer("request", 0.99))).toEqual({ kind: "chat", reason: "model" });
  });

  test("below the floor there is no opinion, whatever was picked", () => {
    expect(readIntentAnswer(answer("recipe", CONFIDENCE_FLOOR - 0.01))).toEqual({ kind: "unknown" });
    expect(readIntentAnswer(answer("request", 0))).toEqual({ kind: "unknown" });
  });

  /** The floor is inclusive. Stated as a test because the comparison is one character from not being. */
  test("exactly at the floor is confident enough to act on", () => {
    expect(readIntentAnswer(answer("recipe", CONFIDENCE_FLOOR))).toEqual({ kind: "recipe" });
  });
});

describe("classifyIntent", () => {
  test("answers with the intent the model settled on", async () => {
    answering({ answers: { intent: answer("recipe", 0.9) } });

    await expect(classifyIntent({ text: "boeuf bourguignon", locale: "fr" })).resolves.toEqual({
      kind: "recipe",
    });
  });

  test("tells the model what was already searched, and in which language", async () => {
    const fetched = vi.fn(
      async () => new Response(JSON.stringify({ answers: { intent: answer("ingredient", 0.9) } })),
    );
    vi.stubGlobal("fetch", fetched);

    await classifyIntent({ text: "yuzu", locale: "fr" });

    const [, init] = fetched.mock.calls[0] as unknown as [string, RequestInit];

    expect(JSON.parse(init.body as string).state).toEqual({
      input: "yuzu",
      locale: "fr",
      ingredientCatalog: "searched, no match",
      recipeTitles: "searched, no match",
    });
  });

  /**
   * The promise the navigation bar is built on: the worst this can do is cost a round trip. Each of
   * these used to be a rejected promise arriving in an `onSubmit` that had already cleared the box.
   */
  test.each([
    ["the service refuses", { error: "nope" }, 402],
    ["the answer is unusable", { answers: { intent: { ...answer("recipe", 0.9), choice: "dish" } } }, 200],
    ["the body is not a System One answer", { choices: [] }, 200],
  ])("has no opinion when %s, and does not throw", async (_case, body, status) => {
    answering(body, status);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(classifyIntent({ text: "anything", locale: "en" })).resolves.toEqual({
      kind: "unknown",
    });
    expect(logged).toHaveBeenCalled();
  });
});
