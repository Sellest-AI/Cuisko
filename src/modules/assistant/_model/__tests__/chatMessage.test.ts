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

/** A showSubstitutions call, finished unless told otherwise. */
const showSubstitutions = (output: unknown, state = "output-available", toolCallId = "call-s") => ({
  type: "tool-showSubstitutions",
  toolCallId,
  state,
  output,
});

const swaps = (...pairs: [string, string][]) => ({ v: 1, swaps: pairs.map(([from, to]) => ({ from, to })) });

describe("the substitutions under an answer", () => {
  test("a finished call is drawn, swaps in the order Cuisko gave", () => {
    const [drawn] = toChatMessages([
      message({ parts: [showSubstitutions(swaps(["carrot", "tomato"], ["water", "milk"]))] }),
    ]);

    expect(drawn?.substitutions).toEqual(swaps(["carrot", "tomato"], ["water", "milk"]));
  });

  test("draws no status line", () => {
    const [drawn] = toChatMessages([message({ parts: [showSubstitutions(swaps(["a", "b"]))] })]);

    expect(drawn?.steps).toEqual([]);
  });

  test("a call still streaming, or one that errored, is not drawn", () => {
    const [drawn] = toChatMessages([
      message({
        parts: [
          showSubstitutions(undefined, "input-available", "s1"),
          showSubstitutions(undefined, "output-error", "s2"),
        ],
      }),
    ]);

    expect(drawn?.substitutions).toBeUndefined();
  });

  /** An older app meeting a newer card shows the answer without it rather than half of it. */
  test("drops a version this build does not know, and a malformed or empty card", () => {
    for (const output of [
      { v: 2, swaps: [{ from: "a", to: "b" }] },
      { v: 1, swaps: [{ from: "a", to: 7 }] },
      { v: 1, swaps: [{ from: "a", to: "b" }, "nope"] },
      { v: 1, swaps: [] },
      "nope",
    ]) {
      const [drawn] = toChatMessages([message({ parts: [showSubstitutions(output)] })]);

      expect(drawn?.substitutions).toBeUndefined();
    }
  });

  test("a model that sent two gets its last", () => {
    const [drawn] = toChatMessages([
      message({
        parts: [
          showSubstitutions(swaps(["a", "b"]), "output-available", "s1"),
          showSubstitutions(swaps(["c", "d"]), "output-available", "s2"),
        ],
      }),
    ]);

    expect(drawn?.substitutions).toEqual(swaps(["c", "d"]));
  });

  /** Swaps alone are an answer: the turn is neither dropped nor marked failed. */
  test("a turn that answered with only swaps is showing something", () => {
    const [drawn] = toChatMessages([
      message({ text: "", status: "success", parts: [showSubstitutions(swaps(["a", "b"]))] }),
    ]);

    expect(drawn?.hasFailed).toBe(false);
    expect(drawn && isShowingSomething(drawn)).toBe(true);
  });
});

/** A run of text the model wrote in one step. */
const said = (text: string) => ({ type: "text", text });

describe("the order an answer is drawn in", () => {
  /**
   * The reported bug: every text part arrives joined into `text`, so a sentence written after the
   * recipe cards was drawn above them, and "a sentence between two cards" never showed between.
   */
  test("text and what was shown are drawn in the order the model wrote them", () => {
    const [drawn] = toChatMessages([
      message({
        parts: [
          said("Trois idées :"),
          display(card("r1")),
          said("Et pour la crème :"),
          showSubstitutions(swaps(["cream", "milk"])),
          said("Bon appétit !"),
        ],
      }),
    ]);

    expect(drawn?.blocks).toEqual([
      { type: "text", key: "text-0", text: "Trois idées :" },
      { type: "display", key: "call-d", card: card("r1") },
      { type: "text", key: "text-2", text: "Et pour la crème :" },
      { type: "substitutions", key: "call-s", card: swaps(["cream", "milk"]) },
      { type: "text", key: "text-4", text: "Bon appétit !" },
    ]);
  });

  /** A search draws its line at the top; where it was called, it must not cut the text in two. */
  test("text on either side of a search stays one bubble, one paragraph per step", () => {
    const [drawn] = toChatMessages([
      message({
        parts: [said("Je regarde."), { type: "step-start" }, search("output-available", found("r1")), said("Voilà.")],
      }),
    ]);

    expect(drawn?.blocks).toEqual([{ type: "text", key: "text-0", text: "Je regarde.\n\nVoilà." }]);
  });

  test("a text part that is blank, or only an id, adds nothing", () => {
    const [drawn] = toChatMessages([
      message({ parts: [said("  "), display(card("r1")), said("k57a1b2c3d4e5f6g7h8i9j0k1l2m3n4p")] }),
    ]);

    expect(drawn?.blocks).toEqual([{ type: "display", key: "call-d", card: card("r1") }]);
  });

  /** Same rule as `substitutions` and `button`, and the dropped one does not split the text. */
  test("the swaps and the button keep their last, where it was called", () => {
    const [drawn] = toChatMessages([
      message({
        parts: [
          showSubstitutions(swaps(["a", "b"]), "output-available", "s1"),
          said("Plutôt :"),
          showSubstitutions(swaps(["c", "d"]), "output-available", "s2"),
          showButton(offer({ text: "Premier" }), "output-available", "b1"),
          said("Sinon"),
          showButton(offer(), "output-available", "b2"),
          said("à toi de voir."),
        ],
      }),
    ]);

    expect(drawn?.blocks).toEqual([
      { type: "text", key: "text-1", text: "Plutôt :" },
      { type: "substitutions", key: "s2", card: swaps(["c", "d"]) },
      { type: "text", key: "text-4", text: "Sinon" },
      { type: "button", key: "b2", button: offer() },
      { type: "text", key: "text-6", text: "à toi de voir." },
    ]);
  });

  test("a card still streaming, errored or unknown is not drawn", () => {
    const [drawn] = toChatMessages([
      message({
        status: "streaming",
        parts: [said("Voilà."), display(card("r1"), "input-available"), display({ v: 9 }), showButton(undefined, "output-error")],
      }),
    ]);

    expect(drawn?.blocks).toEqual([{ type: "text", key: "text-0", text: "Voilà." }]);
  });

  /** A thread stored with its text and no text part still draws the text, first. */
  test("text with no text part is drawn first", () => {
    const [drawn] = toChatMessages([message({ text: "Voilà.", parts: [display(card("r1"))] })]);

    expect(drawn?.blocks).toEqual([
      { type: "text", key: "text", text: "Voilà." },
      { type: "display", key: "call-d", card: card("r1") },
    ]);
  });

  test("a question has no blocks: it is drawn from its text", () => {
    const [drawn] = toChatMessages([message({ role: "user", text: "Salut", parts: [said("Salut")] })]);

    expect(drawn?.blocks).toEqual([]);
  });
});

describe("whether Cuisko is still replying", () => {
  test("an answer streaming in is", () => {
    expect(toChatMessages([message({ status: "streaming" })])[0]?.isReplying).toBe(true);
  });

  /**
   * Between two steps the answer is `pending` while the model reads a tool's result. It is not
   * streaming, and the turn is not over: the loader must not blink off in that gap.
   */
  test("an answer waiting between two steps is, though it is not streaming", () => {
    const [drawn] = toChatMessages([message({ status: "pending", parts: [said("Je regarde."), display(card("r1"))] })]);

    expect(drawn?.isStreaming).toBe(false);
    expect(drawn?.isReplying).toBe(true);
  });

  test("an answer whose turn is over is not, whether it succeeded or failed", () => {
    for (const status of ["success", "failed"]) {
      expect(toChatMessages([message({ status })])[0]?.isReplying).toBe(false);
    }
  });

  test("a question never is", () => {
    expect(toChatMessages([message({ role: "user", text: "Salut", status: "pending" })])[0]?.isReplying).toBe(false);
  });
});

/** A cellar tool call, finished unless told otherwise. */
const cellarCall = (
  tool: "addToCellar" | "removeFromCellar",
  output: unknown,
  state = "output-available",
  toolCallId = "call-c",
) => ({ type: `tool-${tool}`, toolCallId, state, output });

const potatoes = { ingredientId: "potato", cellarItemId: "row-potato", unit: "g", quantity: 500, restoreToList: 200 };
const tomatoes = { ingredientId: "tomato", cellarItemId: "row-tomato", unit: "pcs", quantity: 3 };

const change = (action: string, lines: unknown[], failed: unknown[] = []) => ({ v: 1, action, householdId: "home", lines, failed });

describe("the cellar changes under an answer", () => {
  test("an add and a remove are both drawn, in call order, without what failed", () => {
    const [drawn] = toChatMessages([
      message({
        parts: [
          cellarCall("addToCellar", change("add", [potatoes], [{ ingredientId: "yuzu", reason: "nope" }]), "output-available", "c1"),
          cellarCall("removeFromCellar", change("remove", [tomatoes]), "output-available", "c2"),
        ],
      }),
    ]);

    expect(drawn?.cellarChanges).toEqual([
      { v: 1, action: "add", householdId: "home", lines: [potatoes] },
      { v: 1, action: "remove", householdId: "home", lines: [tomatoes] },
    ]);
    expect(drawn?.blocks.map((block) => block.type)).toEqual(["text", "cellar", "cellar"]);
  });

  test("draws no status line", () => {
    const [drawn] = toChatMessages([message({ parts: [cellarCall("addToCellar", change("add", [potatoes]))] })]);

    expect(drawn?.steps).toEqual([]);
  });

  test("a call still running, or one that errored, is not drawn", () => {
    const [drawn] = toChatMessages([
      message({
        parts: [
          cellarCall("addToCellar", undefined, "input-available", "c1"),
          cellarCall("removeFromCellar", undefined, "output-error", "c2"),
        ],
      }),
    ]);

    expect(drawn?.cellarChanges).toEqual([]);
  });

  /**
   * The lines are the undo's receipt: a card missing one would offer to undo the change and leave
   * part of it standing. So one bad line drops the whole card, and a change where nothing landed has
   * nothing to show or undo.
   */
  test("drops an unknown version or action, a missing household, a malformed line, and a change where nothing landed", () => {
    for (const output of [
      { ...change("add", [potatoes]), v: 2 },
      change("restock", [potatoes]),
      { ...change("add", [potatoes]), householdId: undefined },
      change("add", [potatoes, { ...tomatoes, unit: "handful" }]),
      change("add", [potatoes, { ...tomatoes, quantity: 0 }]),
      change("add", [potatoes, { ...tomatoes, cellarItemId: undefined }]),
      change("add", [{ ...potatoes, restoreToList: "200" }]),
      change("remove", [], [{ ingredientId: "tomato", reason: "not in the cellar" }]),
      "nope",
    ]) {
      const [drawn] = toChatMessages([message({ parts: [cellarCall("addToCellar", output)] })]);

      expect(drawn?.cellarChanges).toEqual([]);
    }
  });

  /** A change alone is an answer: the turn is neither dropped nor marked failed. */
  test("a turn that answered with only a cellar change is showing something", () => {
    const [drawn] = toChatMessages([
      message({ text: "", status: "success", parts: [cellarCall("removeFromCellar", change("remove", [tomatoes]))] }),
    ]);

    expect(drawn?.hasFailed).toBe(false);
    expect(drawn && isShowingSomething(drawn)).toBe(true);
  });
});
