import { describe, expect, test } from "vitest";

import { isShowingSomething, type SourceMessage, toChatMessages, withoutIds } from "../chatMessage";

const message = (overrides: Partial<SourceMessage> = {}): SourceMessage => ({
  key: "m1",
  role: "assistant",
  text: "Voilà.",
  status: "success",
  parts: [],
  _creationTime: 1_700_000_000_000,
  ...overrides,
});

/** A search call, in whatever state the stream has reached. */
const search = (state: string, output?: unknown, toolCallId = "call-1") => ({
  type: "tool-searchRecipes",
  toolCallId,
  state,
  output,
});

const _rows = (ids: string[]) => ids.map((id) => ({ id, title: `Recipe ${id}` }));

/** A search output: one entry per name searched, beside the recipes it found. */
const found = (...ids: string[]) => [{ query: "bolognaise", recipes: _rows(ids) }];

/** A display call, finished unless told otherwise. */
const display = (output: unknown, state = "output-available") => ({
  type: "tool-display",
  toolCallId: "call-d",
  state,
  output,
});

const card = (...ids: string[]) => ({ v: 1, kind: "recipes", ids });

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

  /**
   * The reported bug: a turn that ended with nothing to show used to be dropped as inert, so the
   * hook never saw an answer and "Cuisko is thinking" spun until the app was killed. It now reads as
   * failed, which both tells the cook and ends the wait.
   */
  test("an assistant turn that ended with nothing to show does, as a failure", () => {
    const drawn = toChatMessages([message({ text: "", status: "success" })]);

    expect(drawn).toHaveLength(1);
    expect(drawn[0]?.hasFailed).toBe(true);
  });

  /** The way that happened in practice: the only thing the turn did was a display that threw. */
  test("so does a turn whose only act was a display that failed", () => {
    const failedDisplay = { type: "tool-display", toolCallId: "d", state: "output-error" };

    expect(toChatMessages([message({ text: "", parts: [failedDisplay] })])[0]?.hasFailed).toBe(true);
  });

  /** A turn that has not started streaming is not over, and must not be called failed. */
  test("an assistant turn that has not started does not, yet", () => {
    expect(toChatMessages([message({ text: "", status: "pending" })])).toEqual([]);
  });

  test("an answer with text is not failed", () => {
    expect(toChatMessages([message({ text: "Voilà.", status: "success" })])[0]?.hasFailed).toBe(false);
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

  test("an answer with no text but a card does", () => {
    const drawn = toChatMessages([
      message({ text: "", status: "success", parts: [display(card("r1"))] }),
    ]);

    expect(drawn[0]?.cards).toEqual([card("r1")]);
  });

  /** The first thing a turn shows is often a search, before any word of the answer. */
  test("an answer with nothing yet but a search does", () => {
    const drawn = toChatMessages([
      message({ text: "", status: "pending", parts: [search("input-available")] }),
    ]);

    expect(drawn[0]?.steps).toHaveLength(1);
  });
});

describe("the status lines", () => {
  /**
   * The assertion the feature exists for. A tool part appears the moment the model DECIDES to call
   * the tool, before the call has run, with no output. That is the "🔍 searching" moment, and it
   * must read as running rather than throw on the missing output.
   */
  test("a call that has not returned reads as running, in both input states", () => {
    const drawn = toChatMessages([
      message({
        status: "streaming",
        parts: [search("input-streaming", undefined, "a"), search("input-available", undefined, "b")],
      }),
    ]);

    expect(drawn[0]?.steps.map((step) => step.status)).toEqual(["running", "running"]);
  });

  test("a returned search reads as done, with how many it found", () => {
    const drawn = toChatMessages([message({ parts: [search("output-available", found("r1", "r2"))] })]);

    expect(drawn[0]?.steps).toEqual([{ key: "call-1", tool: "searchRecipes", status: "done", count: 2 }]);
  });

  test("a search that found nothing is done with zero, not failed", () => {
    const drawn = toChatMessages([message({ parts: [search("output-available", found())] })]);

    expect(drawn[0]?.steps[0]).toMatchObject({ status: "done", count: 0 });
  });

  test("a search over several names counts each recipe once, whichever name found it", () => {
    const output = [
      { query: "bolognaise", recipes: _rows(["r1", "r2"]) },
      { query: "chili con carne", recipes: _rows(["r2", "r3"]) },
      { query: "pizza", recipes: [] },
    ];
    const drawn = toChatMessages([message({ parts: [search("output-available", output)] })]);

    expect(drawn[0]?.steps[0]).toMatchObject({ status: "done", count: 3 });
  });

  /** Threads stored before the search took several names hold `{ recipes }`: one name, one list. */
  test("a search stored in the single-name shape still counts", () => {
    const drawn = toChatMessages([message({ parts: [search("output-available", { recipes: _rows(["r1", "r2"]) })] })]);

    expect(drawn[0]?.steps[0]).toMatchObject({ status: "done", count: 2 });
  });

  test("an ingredient search counts the ingredients it found", () => {
    const part = {
      type: "tool-searchIngredients",
      toolCallId: "call-i",
      state: "output-available",
      output: [{ query: "oeuf", ingredients: [{ id: "i1" }] }, { query: "licorne", ingredients: [] }],
    };

    expect(toChatMessages([message({ parts: [part] })])[0]?.steps[0]).toEqual({
      key: "call-i",
      tool: "searchIngredients",
      status: "done",
      count: 1,
    });
  });

  /** The calculator's line says "calculated": there is nothing for it to count. */
  test("a finished calculation is done without a count", () => {
    const part = { type: "tool-computeNutrition", toolCallId: "call-n", state: "output-available", output: {} };

    expect(toChatMessages([message({ parts: [part] })])[0]?.steps[0]).toEqual({
      key: "call-n",
      tool: "computeNutrition",
      status: "done",
    });
  });

  /** A shape this build does not expect costs the line its number, never the render. */
  test("a returned search with an unexpected shape is done without a count", () => {
    const drawn = toChatMessages([message({ parts: [search("output-available", { recipes: "nope" })] })]);

    expect(drawn[0]?.steps[0]).toEqual({ key: "call-1", tool: "searchRecipes", status: "done" });
  });

  test("a call that errored reads as failed", () => {
    const drawn = toChatMessages([message({ parts: [search("output-error")] })]);

    expect(drawn[0]?.steps[0]?.status).toBe("failed");
  });

  /**
   * A turn that died mid-call leaves its part at `input-available` forever. Reading that as running
   * draws "searching…" under an answer that has already ended, and it never finishes.
   */
  test("a call left running by a turn that has ended reads as failed", () => {
    const drawn = toChatMessages([message({ status: "failed", parts: [search("input-available")] })]);

    expect(drawn[0]?.steps[0]?.status).toBe("failed");
  });

  /** `pending` is a turn that has not started streaming, not one that has stopped. */
  test("a call on a pending turn is still running", () => {
    const drawn = toChatMessages([message({ status: "pending", parts: [search("input-available")] })]);

    expect(drawn[0]?.steps[0]?.status).toBe("running");
  });

  test("keep call order across several searches", () => {
    const drawn = toChatMessages([
      message({
        parts: [search("output-available", found(), "a"), search("output-available", found("r1"), "b")],
      }),
    ]);

    expect(drawn[0]?.steps.map((step) => step.key)).toEqual(["a", "b"]);
  });

  /** `display` has no line of its own: the card IS what it did. */
  test("are not drawn for the display call, nor for a tool this build does not know", () => {
    const other = { type: "tool-somethingElse", state: "output-available", output: found("r9") };

    expect(toChatMessages([message({ parts: [display(card("r1")), other] })])[0]?.steps).toEqual([]);
  });
});

describe("the cards", () => {
  test("come only from display, in the order Cuisko chose", () => {
    const drawn = toChatMessages([
      message({ parts: [search("output-available", found("r1", "r2", "r3")), display(card("r3", "r1"))] }),
    ]);

    expect(drawn[0]?.cards).toEqual([card("r3", "r1")]);
  });

  /**
   * The behaviour this slice replaced: every recipe any search returned used to be drawn. What a
   * search found is research; only what Cuisko passed to display reaches the cook.
   */
  test("are empty when Cuisko searched but showed nothing", () => {
    expect(toChatMessages([message({ parts: [search("output-available", found("r1"))] })])[0]?.cards)
      .toEqual([]);
  });

  test("are not drawn from a display call that has not returned, or that errored", () => {
    const drawn = toChatMessages([
      message({ parts: [display(undefined, "input-available"), display(undefined, "output-error")] }),
    ]);

    expect(drawn[0]?.cards).toEqual([]);
  });

  /** An older app meeting a newer card shows the answer without it rather than guessing. */
  test("drop a kind or a version this build does not know, and a malformed payload", () => {
    const drawn = toChatMessages([
      message({
        parts: [
          display({ v: 1, kind: "week-plan", ids: ["p1"] }),
          display({ v: 2, kind: "recipes", ids: ["r1"] }),
          display({ v: 1, kind: "recipes", ids: [7] }),
          display("nope"),
        ],
      }),
    ]);

    expect(drawn[0]?.cards).toEqual([]);
  });
});

/**
 * ADR 0010's backstop: the model may carry ids to display, and must never show one. The prompt
 * asks; this makes sure.
 */
describe("ids in the answer's text", () => {
  const ID = "kn79f3ke5cqx53b32gdwv1nf6h7wg5qb";

  test("are taken out, with what wrapped them, leaving the sentence readable", () => {
    expect(withoutIds(`Essaie la bolognaise (${ID}), elle est rapide.`))
      .toBe("Essaie la bolognaise, elle est rapide.");
    expect(withoutIds(`La recette \`${ID}\` est prête.`)).toBe("La recette est prête.");
  });

  test("are taken out of what reaches the screen", () => {
    expect(toChatMessages([message({ text: `Voilà ${ID} pour toi.` })])[0]?.text).toBe("Voilà pour toi.");
  });

  /** Only Cuisko is held to it: a cook who pastes an id into their question sees their own words. */
  test("are left in the cook's own message", () => {
    expect(toChatMessages([message({ role: "user", text: ID })])[0]?.text).toBe(ID);
  });

  test("leave long ordinary words, plain numbers and French spacing alone", () => {
    const text = "anticonstitutionnellement, 12345678901234567890123456789012 ! Et toi ?";

    expect(withoutIds(text)).toBe(text);
  });
});

/** A showButton call, finished unless told otherwise. */
const showButton = (output: unknown, state = "output-available", toolCallId = "call-b") => ({
  type: "tool-showButton",
  toolCallId,
  state,
  output,
});

const offer = (overrides: Record<string, unknown> = {}) => ({
  v: 1,
  text: "Tu veux un vrai planning pour ta semaine ?",
  destination: "planning",
  variant: "primary",
  ...overrides,
});

describe("the button under an answer", () => {
  test("a finished call is drawn, beside the cards", () => {
    const [drawn] = toChatMessages([message({ parts: [showButton(offer()), display(card("a"))] })]);

    expect(drawn?.button).toEqual(offer());
    expect(drawn?.cards).toHaveLength(1);
  });

  /** It draws itself; a "running" line for it would be a status for a button, not for work. */
  test("draws no status line", () => {
    const [drawn] = toChatMessages([message({ parts: [showButton(offer())] })]);

    expect(drawn?.steps).toEqual([]);
  });

  test("a call still streaming is not drawn yet", () => {
    const [drawn] = toChatMessages([
      message({ status: "streaming", parts: [showButton(undefined, "input-streaming")] }),
    ]);

    expect(drawn?.button).toBeUndefined();
  });

  /** An older app meeting a newer destination drops the button rather than guessing a route. */
  test.each([
    ["an unknown destination", { destination: "cellar" }],
    ["an unknown variant", { variant: "danger" }],
    ["an unknown version", { v: 2 }],
    ["no sentence", { text: "  " }],
  ])("%s is dropped", (_, overrides) => {
    const [drawn] = toChatMessages([message({ parts: [showButton(offer(overrides))] })]);

    expect(drawn?.button).toBeUndefined();
  });

  test("its sentence loses any id, like the answer does", () => {
    const [drawn] = toChatMessages([
      message({ parts: [showButton(offer({ text: "Planifie (k57a1b2c3d4e5f6g7h8i9j0k1l2m3n4p) ta semaine." }))] }),
    ]);

    expect(drawn?.button?.text).toBe("Planifie ta semaine.");
  });

  test("two calls keep the last one", () => {
    const [drawn] = toChatMessages([
      message({
        parts: [
          showButton(offer({ destination: "recipes" }), "output-available", "b1"),
          showButton(offer(), "output-available", "b2"),
        ],
      }),
    ]);

    expect(drawn?.button?.destination).toBe("planning");
  });

  /** A turn whose only act was a button said something: it is not the empty failure. */
  test("a turn with only a button has not failed", () => {
    const [drawn] = toChatMessages([message({ text: "", parts: [showButton(offer())] })]);

    expect(drawn?.hasFailed).toBe(false);
  });

  test("a user message never carries one", () => {
    const [drawn] = toChatMessages([message({ role: "user", text: "Salut", parts: [showButton(offer())] })]);

    expect(drawn?.button).toBeUndefined();
  });
});

/**
 * What the hook reads to stop "Cuisko is thinking". The reported case: a turn that answered with
 * only a button was drawn, but not counted as showing anything, so the spinner never stopped.
 */
describe("isShowingSomething", () => {
  test("a turn that answered with only a button is", () => {
    const [drawn] = toChatMessages([message({ text: "", parts: [showButton(offer())] })]);

    expect(drawn && isShowingSomething(drawn)).toBe(true);
  });

  test("an answer that has not started is not", () => {
    const [drawn] = toChatMessages([message({ text: "", status: "streaming" })]);

    expect(drawn && isShowingSomething(drawn)).toBe(false);
  });
});
