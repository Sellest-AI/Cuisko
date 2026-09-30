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
  type AssistantButton,
  type AssistantTool,
  BUTTON_DESTINATIONS,
  BUTTON_VARIANTS,
  CELLAR_ACTIONS,
  type CellarChange,
  type CellarChangeLine,
  DISPLAY_KINDS,
  type DisplayCard,
  type DisplayKind,
  type IngredientSwap,
  type MealPlanned,
  type SubstitutionsCard,
} from "@shared/assistant";
import { UNITS } from "@shared/ingredients";
import { MEAL_SLOTS } from "@shared/mealSlots";

/**
 * One part of a stored message: a tool call, or a run of text the model wrote between them.
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
  /** Present on text parts: what the model wrote in one step, in the order it wrote it. */
  text?: string;
};

/** A message as the agent component stores it, narrowed to what this file actually reads. */
export type SourceMessage = {
  key: string;
  role: string;
  /**
   * Every text part of the message, joined with a space. Empty while only a tool call has arrived.
   * It loses where each part sat between the tool calls; `parts` keeps that.
   */
  text: string;
  status: string;
  parts: readonly MessagePart[];
  /** When the component stored it — the server's clock, not the phone's. */
  _creationTime: number;
};

/**
 * The tools that show the cook a status line while they work. `display`, `showButton`,
 * `showSubstitutions`, the two cellar tools and `planMeal` do not: what they draw is their line.
 */
export type StepTool = Exclude<
  AssistantTool,
  | typeof ASSISTANT_TOOLS.display
  | typeof ASSISTANT_TOOLS.showButton
  | typeof ASSISTANT_TOOLS.showSubstitutions
  | typeof ASSISTANT_TOOLS.addToCellar
  | typeof ASSISTANT_TOOLS.removeFromCellar
  | typeof ASSISTANT_TOOLS.planMeal
>;

/**
 * A cellar change as the screen draws it: the lines that landed. What was absent or failed is the
 * model's to say.
 */
export type DrawnCellarChange = Omit<CellarChange, "absent" | "failed">;

/** One status line: "🔍 searching recipes", then "🥗 3 recipes found". */
export type ToolStep = {
  key: string;
  tool: StepTool;
  status: "running" | "done" | "failed";
  /** What a finished call found, when the tool counts something. */
  count?: number;
};

/**
 * One piece of an answer, in the order the model produced it: a run of text, or something a show
 * tool drew. Keyed so a list of them keeps each one mounted while the answer streams in.
 */
export type AnswerBlock =
  | { type: "text"; key: string; text: string }
  | { type: "display"; key: string; card: DisplayCard }
  | { type: "substitutions"; key: string; card: SubstitutionsCard }
  | { type: "cellar"; key: string; change: DrawnCellarChange }
  | { type: "meal"; key: string; meal: MealPlanned }
  | { type: "button"; key: string; button: AssistantButton };

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
  /**
   * The button Cuisko offered under the answer, if any. One at most: the prompt asks for one, and
   * a model that sent two gets its last, the one it settled on.
   */
  button?: AssistantButton;
  /**
   * The ingredient swaps Cuisko suggested, if any. One card at most, and like the button, a model
   * that sent two gets its last.
   */
  substitutions?: SubstitutionsCard;
  /**
   * The cellar changes Cuisko made, in call order. Several, unlike the swaps: "add the potatoes,
   * take out the carrots" is two changes, and each has its own undo.
   */
  cellarChanges: DrawnCellarChange[];
  /**
   * The plates Cuisko planned, in call order, each with its own undo. A slot it found taken is not
   * one: nothing was planned, and the model asks about it in its text.
   */
  plannedMeals: MealPlanned[];
  /**
   * The answer as the screen draws it below its status lines: its text and what it showed,
   * interleaved in the order the model wrote them. Empty for a user message.
   *
   * `text`, `cards`, `substitutions` and `button` above say what the answer holds; this says where
   * each piece goes, so a sentence the model wrote after a card is drawn after it.
   */
  blocks: AnswerBlock[];
  /** The answer is still arriving — the screen shows it growing rather than waiting. */
  isStreaming: boolean;
  /**
   * The turn behind this answer is not over: more text or another card may still come.
   *
   * Wider than `isStreaming`, and that is the point: between two steps the answer is `pending`, not
   * streaming, while the model reads a tool's result. Only a settled status ends it. Always false
   * for a question.
   */
  isReplying: boolean;
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

/** How many distinct rows these are: one found under two names is still one thing to the cook. */
const _distinctIds = (rows: unknown[]): number =>
  new Set(rows.map((row) => (_isObject(row) ? row.id : undefined)).filter((id) => id !== undefined)).size;

/**
 * Counts a search that answers `[{ query, <field>: [...] }]`, one entry per name searched.
 * `undefined` for any other shape, so a changed tool costs the line its number and nothing more.
 */
const _countFound = (field: string) => (output: unknown): number | undefined => {
  if (!Array.isArray(output)) return undefined;
  const lists = output.map((entry) => (_isObject(entry) ? entry[field] : undefined));

  return lists.every(Array.isArray) ? _distinctIds(lists.flat()) : undefined;
};

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
    // Threads stored before the search took several names hold one `{ recipes }`.
    _isObject(output) && Array.isArray(output.recipes)
      ? _distinctIds(output.recipes)
      : _countFound("recipes")(output),
  searchIngredients: _countFound("ingredients"),
  // Its line says "calculated"; a count of figures would mean nothing to the cook.
  computeNutrition: () => undefined,
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
 * A stored showButton output → a button, when every field is one this build knows.
 *
 * A destination or variant this build has never heard of drops the button rather than guessing a
 * route for it: an older app meeting a newer button shows the answer without it. The sentence goes
 * through `withoutIds` like the answer does, for the same reason.
 */
const _buttonOf = (output: unknown): AssistantButton | undefined => {
  if (!_isObject(output) || output.v !== 1 || typeof output.text !== "string") return undefined;

  const destination = BUTTON_DESTINATIONS.find((known) => known === output.destination);
  const variant = BUTTON_VARIANTS.find((known) => known === output.variant);
  const text = withoutIds(output.text).trim();

  return destination && variant && text ? { v: 1, text, destination, variant } : undefined;
};

const _buttonOfParts = (parts: readonly MessagePart[]): AssistantButton | undefined =>
  parts
    .filter((part) => part.type === _partType(ASSISTANT_TOOLS.showButton) && part.state === "output-available")
    .map((part) => _buttonOf(part.output))
    .filter((button): button is AssistantButton => button !== undefined)
    .at(-1);

const _isSwap = (value: unknown): value is IngredientSwap =>
  _isObject(value) && typeof value.from === "string" && typeof value.to === "string";

/**
 * A stored showSubstitutions output → a card, when it is one this build knows.
 *
 * A version this build has never seen, or a malformed row, drops the whole card rather than drawing
 * part of it: a swap list missing a row reads as the full answer, and it is not.
 */
const _substitutionsOf = (output: unknown): SubstitutionsCard | undefined => {
  if (!_isObject(output) || output.v !== 1 || !Array.isArray(output.swaps)) return undefined;
  if (output.swaps.length === 0 || !output.swaps.every(_isSwap)) return undefined;

  return { v: 1, swaps: output.swaps.map(({ from, to }) => ({ from, to })) };
};

const _substitutionsOfParts = (parts: readonly MessagePart[]): SubstitutionsCard | undefined =>
  parts
    .filter((part) => part.type === _partType(ASSISTANT_TOOLS.showSubstitutions) && part.state === "output-available")
    .map((part) => _substitutionsOf(part.output))
    .filter((card): card is SubstitutionsCard => card !== undefined)
    .at(-1);

const _CELLAR_TOOL_PARTS = [
  _partType(ASSISTANT_TOOLS.addToCellar),
  _partType(ASSISTANT_TOOLS.removeFromCellar),
];

const _isCellarLine = (value: unknown): value is CellarChangeLine =>
  _isObject(value) &&
  typeof value.ingredientId === "string" &&
  typeof value.cellarItemId === "string" &&
  UNITS.some((unit) => unit === value.unit) &&
  typeof value.quantity === "number" &&
  value.quantity > 0 &&
  (value.restoreToList === undefined || typeof value.restoreToList === "number");

/**
 * A stored cellar tool output → the change to draw, when it is one this build knows.
 *
 * **One malformed line drops the whole card, never just that line.** The lines are the undo's
 * receipt: a card missing one would offer to undo the change and leave part of it standing. A change
 * with no line that landed is dropped too, since there is nothing to show and nothing to undo.
 */
const _cellarChangeOf = (output: unknown): DrawnCellarChange | undefined => {
  if (!_isObject(output) || output.v !== 1 || !Array.isArray(output.lines)) return undefined;

  const action = CELLAR_ACTIONS.find((known) => known === output.action);
  if (!action || typeof output.householdId !== "string") return undefined;
  if (output.lines.length === 0 || !output.lines.every(_isCellarLine)) return undefined;

  return {
    v: 1,
    action,
    householdId: output.householdId,
    lines: output.lines.map(({ ingredientId, cellarItemId, unit, quantity, restoreToList }) => ({
      ingredientId,
      cellarItemId,
      unit,
      quantity,
      ...(restoreToList !== undefined && { restoreToList }),
    })),
  };
};

const _cellarChangesOf = (parts: readonly MessagePart[]): DrawnCellarChange[] =>
  parts
    .filter((part) => _CELLAR_TOOL_PARTS.includes(part.type) && part.state === "output-available")
    .map((part) => _cellarChangeOf(part.output))
    .filter((change): change is DrawnCellarChange => change !== undefined);

const _isServings = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

/**
 * A stored planMeal output → the plate to draw, when one landed and this build knows its shape.
 *
 * `occupied` is dropped with the malformed: nothing was planned, so there is no card and no undo. A
 * malformed `replaced` drops the whole plate rather than just the field, since the undo would then
 * take the new dish off the slot and never put back the one it replaced.
 */
const _mealPlannedOf = (output: unknown): MealPlanned | undefined => {
  if (!_isObject(output) || output.v !== 1 || output.status !== "planned") return undefined;

  const { householdId, plannedMealId, recipeId, date, servings, replaced } = output;
  const slot = MEAL_SLOTS.find((known) => known === output.slot);

  if (typeof householdId !== "string" || typeof plannedMealId !== "string" || typeof recipeId !== "string") return undefined;
  if (typeof date !== "number" || !slot || !_isServings(servings)) return undefined;

  const isReplaced = _isObject(replaced) && typeof replaced.recipeId === "string" && _isServings(replaced.servings);
  if (replaced !== undefined && !isReplaced) return undefined;

  return {
    v: 1,
    status: "planned",
    householdId,
    plannedMealId,
    recipeId,
    date,
    slot,
    servings,
    ...(isReplaced && { replaced: { recipeId: replaced.recipeId as string, servings: replaced.servings as number } }),
  };
};

const _plannedMealsOf = (parts: readonly MessagePart[]): MealPlanned[] =>
  parts
    .filter((part) => part.type === _partType(ASSISTANT_TOOLS.planMeal) && part.state === "output-available")
    .map((part) => _mealPlannedOf(part.output))
    .filter((meal): meal is MealPlanned => meal !== undefined);

/** A show tool's finished part → its block, when its output is one this build can draw. */
const _showBlockOf = (part: MessagePart, index: number): AnswerBlock | undefined => {
  if (part.state !== "output-available") return undefined;

  const key = part.toolCallId ?? `${part.type}-${index}`;

  switch (part.type) {
    case _partType(ASSISTANT_TOOLS.display): {
      const card = _cardOf(part.output);
      return card && { type: "display", key, card };
    }
    case _partType(ASSISTANT_TOOLS.showSubstitutions): {
      const card = _substitutionsOf(part.output);
      return card && { type: "substitutions", key, card };
    }
    case _partType(ASSISTANT_TOOLS.showButton): {
      const button = _buttonOf(part.output);
      return button && { type: "button", key, button };
    }
    case _partType(ASSISTANT_TOOLS.addToCellar):
    case _partType(ASSISTANT_TOOLS.removeFromCellar): {
      const change = _cellarChangeOf(part.output);
      return change && { type: "cellar", key, change };
    }
    case _partType(ASSISTANT_TOOLS.planMeal): {
      const meal = _mealPlannedOf(part.output);
      return meal && { type: "meal", key, meal };
    }
    default:
      return undefined;
  }
};

/**
 * The parts → the blocks the screen draws, in the order the model wrote them.
 *
 * **Text only splits where something was shown.** A search between two sentences draws nothing
 * there (its status line is at the top), so the text on either side stays one bubble; the steps it
 * came from are separate paragraphs. A text part with only whitespace, or only an id, adds nothing.
 *
 * **The swaps and the button keep their last, as `substitutions` and `button` do**, at the place it
 * was called: one each at most, and the one the model settled on.
 *
 * A message with text but no text part at all, as a thread stored by an older build may be, gets
 * its text as one block ahead of the rest rather than none.
 */
const _blocksOf = (parts: readonly MessagePart[], text: string): AnswerBlock[] => {
  const shown = parts.map(_showBlockOf);
  // Settled before the text is laid out, so a card that is dropped does not split the text around it.
  const lastOf = (type: AnswerBlock["type"]) => shown.findLastIndex((block) => block?.type === type);
  const kept = new Set([lastOf("substitutions"), lastOf("button")]);
  const blocks: AnswerBlock[] = [];

  parts.forEach((part, index) => {
    const block = shown[index];

    if (block) {
      const isOneOfMany = block.type === "substitutions" || block.type === "button";
      if (!isOneOfMany || kept.has(index)) blocks.push(block);
      return;
    }

    if (part.type !== "text") return;

    const written = withoutIds(part.text ?? "").trim();
    if (!written) return;

    const previous = blocks.at(-1);
    if (previous?.type === "text") previous.text = `${previous.text}\n\n${written}`;
    else blocks.push({ type: "text", key: `text-${index}`, text: written });
  });

  const hasTextParts = parts.some((part) => part.type === "text");
  return !hasTextParts && text.trim() ? [{ type: "text", key: "text", text: text.trim() }, ...blocks] : blocks;
};

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
 * Whether a message has anything on screen yet: text, a status line, a card, swaps, a button or a
 * cellar change.
 *
 * One definition, because two places ask it: `toChatMessages` to decide what is drawn, and the
 * hook to decide the answer has arrived. Written out twice, the button was added to one and not the
 * other, and a turn that answered with only a button left "Cuisko is thinking" spinning under it.
 */
export const isShowingSomething = (message: ChatMessage): boolean =>
  message.text.length > 0 ||
  message.steps.length > 0 ||
  message.cards.length > 0 ||
  message.substitutions !== undefined ||
  message.button !== undefined ||
  message.cellarChanges.length > 0 ||
  message.plannedMeals.length > 0;

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
      const button = isUser ? undefined : _buttonOfParts(message.parts);
      const substitutions = isUser ? undefined : _substitutionsOfParts(message.parts);
      const cellarChanges = isUser ? [] : _cellarChangesOf(message.parts);
      const plannedMeals = isUser ? [] : _plannedMealsOf(message.parts);
      const blocks = isUser ? [] : _blocksOf(message.parts, text);
      const endedEmpty =
        !isUser && isTurnOver && !text && steps.length === 0 && cards.length === 0 && !button &&
        !substitutions && cellarChanges.length === 0 && plannedMeals.length === 0;

      return {
        key: message.key,
        from: isUser ? "user" : "assistant",
        text,
        steps,
        cards,
        ...(button && { button }),
        ...(substitutions && { substitutions }),
        cellarChanges,
        plannedMeals,
        blocks,
        isStreaming,
        isReplying: !isUser && !isTurnOver,
        hasFailed: message.status === "failed" || endedEmpty,
        createdAt: message._creationTime,
      };
    })
    .filter((message) => isShowingSomething(message) || message.isStreaming || message.hasFailed);
