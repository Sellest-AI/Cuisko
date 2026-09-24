/**
 * What the assistant screen draws, derived from what the agent component stores.
 *
 * In `_model/` because it is the one piece of this module with rules worth pinning: which messages
 * appear at all, what a tool call reads as while it runs, which cards are real, and what "still
 * arriving" means. None of that needs React, Jotai or a Convex provider to be true, and all of it
 * is easy to get subtly wrong against a message that is still streaming.
 *
 * **It takes a structural type it declares itself, not the agent's `UIMessage`.** `_model/` may not
 * import Convex, and that rule earns its keep here rather than merely being obeyed: the input
 * below says exactly which fields this depends on, so a test writes one in three lines and an
 * upstream type that grows a field cannot quietly change what the screen shows.
 */

import {
  ASSISTANT_TOOLS,
  DISPLAY_KINDS,
  type DisplayCard,
  type DisplayKind,
} from "@shared/assistant";

/**
 * One part of a stored message. Only the tool parts are read; the text arrives pre-joined.
 *
 * A tool part is named `tool-${name}` by the AI SDK, where `name` is the key the tool is registered
 * under in `answerTurn.ts` — which is why both ends read it from `ASSISTANT_TOOLS`.
 */
export type MessagePart = {
  type: string;
  /** Present on tool parts: the call's id, stable from the moment the model starts writing it. */
  toolCallId?: string;
  /** `input-streaming` · `input-available` · `output-available` · `output-error` · `output-denied` … */
  state?: string;
  output?: unknown;
};

/** A message as the agent component stores it, narrowed to what this file actually reads. */
export type SourceMessage = {
  key: string;
  role: string;
  /** Every text part of the message, already joined. Empty while only a tool call has arrived. */
  text: string;
  status: string;
  parts: readonly MessagePart[];
  /** When the component stored it — the server's clock, not the phone's. */
  _creationTime: number;
};

/** The tools that show the cook a status line while they work. `display` does not: its card is its line. */
export type StepTool = typeof ASSISTANT_TOOLS.searchRecipes;

/** One status line: "🔍 searching recipes", then "🥗 3 recipes found". */
export type ToolStep = {
  key: string;
  tool: StepTool;
  status: "running" | "done" | "failed";
  /** What a finished call found, when the tool counts something. */
  count?: number;
};

/** A message as the screen draws it. */
export type ChatMessage = {
  key: string;
  from: "user" | "assistant";
  /** The answer's text, with anything shaped like a document id taken out (ADR 0010). */
  text: string;
  /** Status lines for the tools this turn called, in call order. */
  steps: ToolStep[];
  /** What Cuisko chose to show, in call order. Only finished, well-formed `display` calls. */
  cards: DisplayCard[];
  /** The answer is still arriving — the screen shows it growing rather than waiting. */
  isStreaming: boolean;
  /**
   * The turn failed before it could say anything useful.
   *
   * Carried rather than filtered out, because two things upstream depend on knowing: the screen
   * has to tell the shopper their question went nowhere, and the hook has to stop waiting for an
   * answer that is never coming. A failure hidden here is a spinner that runs forever.
   */
  hasFailed: boolean;
  /**
   * When the message was stored, by the server's clock.
   *
   * Carried so the client can measure the idle window from the same instant the server measures
   * it from. Using the phone's "now" instead makes merely reopening the modal look like activity
   * to the client while the server is still counting from the last real message — the two then
   * disagree about whether a conversation may be continued, and the shopper watches a transcript
   * they can see get abandoned by their next question.
   */
  createdAt: number;
};

const _partType = (tool: string) => `tool-${tool}`;

const _isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * What each step tool's finished output counts, if it is the shape expected.
 *
 * **Guarded at every step, because the output of a part is genuinely `unknown` here** — a tool
 * whose shape changed, or a thread stored by an older build, must cost a status line its number,
 * never throw during a render. A `Record` over `StepTool` so a new step tool cannot be added
 * without saying what it counts.
 */
const _COUNTS: Record<StepTool, (output: unknown) => number | undefined> = {
  searchRecipes: (output) =>
    _isObject(output) && Array.isArray(output.recipes) ? output.recipes.length : undefined,
};

const _STEP_TOOLS = Object.keys(_COUNTS) as StepTool[];

/**
 * A tool part → the line the cook reads.
 *
 * **A call still "running" on a turn that has stopped is a failure.** The part only reaches
 * `output-*` if the call returned; a turn that died mid-call leaves it at `input-available`
 * forever, and drawing that as "searching…" would be a line that never finishes, under an answer
 * that already has.
 */
const _stepOf = (
  tool: StepTool,
  part: MessagePart,
  index: number,
  isTurnOver: boolean,
): ToolStep => {
  const key = part.toolCallId ?? `${tool}-${index}`;

  if (part.state === "output-available") {
    const count = _COUNTS[tool](part.output);
    return count === undefined ? { key, tool, status: "done" } : { key, tool, status: "done", count };
  }

  if (part.state === "output-error" || part.state === "output-denied" || isTurnOver) {
    return { key, tool, status: "failed" };
  }

  return { key, tool, status: "running" };
};

const _stepsOf = (parts: readonly MessagePart[], isTurnOver: boolean): ToolStep[] =>
  parts.flatMap((part, index) => {
    const tool = _STEP_TOOLS.find((name) => part.type === _partType(name));
    return tool ? [_stepOf(tool, part, index, isTurnOver)] : [];
  });

/**
 * A stored display output → a card, when it is one this build knows how to draw.
 *
 * One reader per kind, and a mapped type makes the list complete: adding a kind to `DISPLAY_KINDS`
 * fails to compile here until someone says how to read it. A card whose kind or version this build
 * does not know is dropped rather than guessed at — an older app meeting a newer card shows the
 * answer without it, which is the honest failure.
 */
const _READERS: { [K in DisplayKind]: (output: Record<string, unknown>) => DisplayCard<K> | undefined } = {
  recipes: (output) =>
    output.v === 1 && Array.isArray(output.ids) && output.ids.every((id) => typeof id === "string")
      ? { kind: "recipes", v: 1, ids: output.ids as string[] }
      : undefined,
};

const _cardOf = (output: unknown): DisplayCard | undefined => {
  if (!_isObject(output)) return undefined;

  const kind = DISPLAY_KINDS.find((known) => known === output.kind);
  return kind ? _READERS[kind](output) : undefined;
};

const _cardsOf = (parts: readonly MessagePart[]): DisplayCard[] =>
  parts
    .filter((part) => part.type === _partType(ASSISTANT_TOOLS.display) && part.state === "output-available")
    .map((part) => _cardOf(part.output))
    .filter((card): card is DisplayCard => card !== undefined);

/**
 * Something shaped like a Convex document id: 31 to 37 lowercase letters and digits, with at least
 * one of each. No French or English word is that long, and a hash-like run that is not an id is
 * noise to a cook either way.
 */
const _ID_SHAPED = /[`(\[]?\b(?=[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]{31,37}\b[`)\]]?/g;

/**
 * The answer with any id taken out — the backstop behind the prompt's "never show an id".
 *
 * ADR 0010 lets the model carry ids to `display`; a model that has held one will sometimes recite
 * it, and the prompt saying not to is a request. The wrapping backticks or brackets go with it, and
 * the gap it leaves is closed, so the sentence reads as if it were never there. Only before `,` and
 * `.`: French sets a space before `! ? ; :`, and that one is the writer's.
 */
export const withoutIds = (text: string): string =>
  text.replace(_ID_SHAPED, "").replace(/ {2,}/g, " ").replace(/ +([,.])/g, "$1");

/**
 * Stored messages → what the screen renders.
 *
 * **A `system` message is dropped**, and it is the only kind that is. It is ours rather than the
 * conversation's: the shopper never wrote it and must never read it.
 *
 * **A failed turn is KEPT, deliberately, even though it has nothing to say.** It is tempting to
 * drop a message with no text, no cards and no stream — it draws as an empty grey bubble — and
 * that is exactly the mistake this used to make. Two things upstream read the transcript to know
 * what is happening: the screen, which owes the shopper an explanation, and the hook, which stops
 * waiting when the answer arrives. Filter the failure out and neither ever learns the turn ended,
 * so the question looks unanswered and "Cuisko is thinking" runs until the app is killed.
 *
 * A streaming message with no text yet is kept for the same family of reasons: it is what the
 * screen hangs its thinking state and its status lines on, and dropping it would make the answer
 * appear from nowhere several seconds after the question.
 *
 * **An assistant turn that ENDED with nothing to show is a failure, not an empty message.** No
 * text, no status line, no card: the model answered with nothing, or its only act was a display
 * that threw. Dropping it, the obvious tidy-up, is what left "Cuisko is thinking" spinning forever —
 * the hook waits for an answer to appear, and a dropped one never does. Marked failed, the cook is
 * told to ask again and the wait ends.
 *
 * What IS dropped is a user message with no text, and an assistant one that has not started: no
 * content and not yet streaming. The first has nothing to show; the second will be back.
 */
export const toChatMessages = (messages: readonly SourceMessage[]): ChatMessage[] =>
  messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message): ChatMessage => {
      const isStreaming = message.status === "streaming";
      const isUser = message.role === "user";
      // Over means settled, not "not streaming": a `pending` turn has not started streaming yet.
      const isTurnOver = message.status === "success" || message.status === "failed";

      const text = isUser ? message.text : withoutIds(message.text);
      const steps = isUser ? [] : _stepsOf(message.parts, isTurnOver);
      const cards = isUser ? [] : _cardsOf(message.parts);
      const endedEmpty = !isUser && isTurnOver && !text && steps.length === 0 && cards.length === 0;

      return {
        key: message.key,
        from: isUser ? "user" : "assistant",
        text,
        steps,
        cards,
        isStreaming,
        hasFailed: message.status === "failed" || endedEmpty,
        createdAt: message._creationTime,
      };
    })
    .filter(
      (message) =>
        message.text.length > 0 ||
        message.steps.length > 0 ||
        message.cards.length > 0 ||
        message.isStreaming ||
        message.hasFailed,
    );
