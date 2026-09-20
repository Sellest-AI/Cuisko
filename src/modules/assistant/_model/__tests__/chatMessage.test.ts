import { describe, expect, test } from "vitest";

import {
  SEARCH_RECIPES_PART,
  type SourceMessage,
  toChatMessages,
} from "../chatMessage";

const message = (overrides: Partial<SourceMessage> = {}): SourceMessage => ({
  key: "m1",
  role: "assistant",
  text: "Voilà.",
  status: "success",
  parts: [],
  _creationTime: 1_700_000_000_000,
  ...overrides,
});

/** A finished tool call carrying two recipes. */
const foundRecipes = (...ids: string[]) => ({
  type: SEARCH_RECIPES_PART,
  output: { recipes: ids.map((id) => ({ id, title: `Recipe ${id}` })) },
});

describe("what reaches the screen", () => {
  test("a user message and an assistant message both do", () => {
    const drawn = toChatMessages([
      message({ key: "a", role: "user", text: "Je fais quoi ?" }),
      message({ key: "b", role: "assistant", text: "Une bolognaise." }),
    ]);

    expect(drawn.map((m) => m.from)).toEqual(["user", "assistant"]);
    expect(drawn[1]?.text).toBe("Une bolognaise.");
  });

  /** Ours, not the conversation's. A shopper reading their own system prompt is a leak. */
  test("a system message does not", () => {
    expect(toChatMessages([message({ role: "system", text: "You are Cuisko" })])).toEqual([]);
  });

  test("an assistant turn with nothing in it and nothing wrong does not", () => {
    expect(toChatMessages([message({ text: "", status: "success" })])).toEqual([]);
  });

  /**
   * The counterpart, and the one that used to be wrong. A failed turn has nothing to SAY, which
   * makes dropping it look like tidiness — but two readers depend on seeing it. The screen owes
   * the shopper an explanation, and the hook stops waiting for an answer when one arrives. Filter
   * it out and the question reads as unanswered while "Cuisko is thinking" runs forever.
   */
  test("a failed turn does, so the screen and the hook both learn it ended", () => {
    const drawn = toChatMessages([message({ text: "", status: "failed" })]);

    expect(drawn).toHaveLength(1);
    expect(drawn[0]?.hasFailed).toBe(true);
  });

  /**
   * The timestamp is the server's, carried through untouched. The client measures the idle window
   * from it, so a value invented on the phone would put the two clocks on different instants.
   */
  test("carries the stored creation time rather than inventing one", () => {
    expect(toChatMessages([message({ _creationTime: 42 })])[0]?.createdAt).toBe(42);
  });

  /**
   * The counterpart to the test above, and the reason that one cannot simply drop empty messages:
   * an answer has no text for the moment between the question being sent and the first token
   * arriving. Dropping it there means the screen has nothing to hang "Cuisko is thinking" on, and
   * the answer appears out of nowhere seconds later.
   */
  test("an empty message that is still streaming does", () => {
    const drawn = toChatMessages([message({ text: "", status: "streaming" })]);

    expect(drawn).toHaveLength(1);
    expect(drawn[0]?.isStreaming).toBe(true);
  });

  test("an answer with no text but recipes found does", () => {
    const drawn = toChatMessages([
      message({ text: "", status: "success", parts: [foundRecipes("r1")] }),
    ]);

    expect(drawn[0]?.recipeIds).toEqual(["r1"]);
  });
});

describe("the recipe ids", () => {
  test("come off the tool part", () => {
    const drawn = toChatMessages([message({ parts: [foundRecipes("r1", "r2")] })]);

    expect(drawn[0]?.recipeIds).toEqual(["r1", "r2"]);
  });

  test("are empty when the tool was never called", () => {
    expect(toChatMessages([message()])[0]?.recipeIds).toEqual([]);
  });

  /**
   * The assertion this file exists for. A tool part appears on the message the moment the model
   * DECIDES to call the tool — before the call has run — so `output` is legitimately missing on a
   * part that will carry recipes a second later. Reading it straight throws, and it throws during
   * the single most ordinary moment of the whole feature.
   */
  test("survive a tool part whose call has not returned yet", () => {
    const pending = { type: SEARCH_RECIPES_PART };

    expect(toChatMessages([message({ parts: [pending], status: "streaming" })])[0]?.recipeIds)
      .toEqual([]);
  });

  test("survive a tool that errored, and a shape that is not what we expect", () => {
    const errored = { type: SEARCH_RECIPES_PART, output: { error: "boom" } };
    const wrong = { type: SEARCH_RECIPES_PART, output: { recipes: "nope" } };
    const ragged = { type: SEARCH_RECIPES_PART, output: { recipes: [{ id: 7 }, null, { id: "r1" }] } };

    expect(toChatMessages([message({ parts: [errored, wrong, ragged] })])[0]?.recipeIds)
      .toEqual(["r1"]);
  });

  /**
   * A turn may search twice — the prompt tells the model to try another dish name when the first
   * finds nothing, and two related searches can land on the same recipe. Drawing it twice in one
   * row of cards reads as a bug, and the first search's ranking is the one to keep.
   */
  test("are de-duplicated across several searches, earliest first", () => {
    const drawn = toChatMessages([
      message({ parts: [foundRecipes("r1", "r2"), foundRecipes("r2", "r3")] }),
    ]);

    expect(drawn[0]?.recipeIds).toEqual(["r1", "r2", "r3"]);
  });

  /** Only our tool's parts are read — another tool's output is not a list of recipes. */
  test("ignore a part belonging to a different tool", () => {
    const other = { type: "tool-somethingElse", output: { recipes: [{ id: "r9" }] } };

    expect(toChatMessages([message({ parts: [other] })])[0]?.recipeIds).toEqual([]);
  });
});
