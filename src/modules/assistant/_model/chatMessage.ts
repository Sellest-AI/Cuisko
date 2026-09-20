/**
 * What the assistant screen draws, derived from what the agent component stores.
 *
 * In `_model/` because it is the one piece of this module with rules worth pinning: which messages
 * appear at all, where the recipe ids come from, and what "still arriving" means. None of that
 * needs React, Jotai or a Convex provider to be true, and all of it is easy to get subtly wrong
 * against a message that is still streaming.
 *
 * **It takes a structural type it declares itself, not the agent's `UIMessage`.** `_model/` may not
 * import Convex, and that rule earns its keep here rather than merely being obeyed: the input
 * below says exactly which four fields this depends on, so a test writes one in three lines and an
 * upstream type that grows a field cannot quietly change what the screen shows.
 */

/**
 * The part the `searchRecipes` tool writes into an assistant message.
 *
 * The AI SDK names a tool part `tool-${name}`, so this string is coupled to the key the tool is
 * registered under in `answerTurn.ts`. Renaming the tool there and not here does not fail to
 * compile — it silently stops finding recipes, and the cards just never appear. There is no type
 * that can join those two ends, so the constant is named and commented on both sides instead.
 */
export const SEARCH_RECIPES_PART = "tool-searchRecipes";

/** One part of a stored message. Only the tool parts are read; the text arrives pre-joined. */
export type MessagePart = {
  type: string;
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

/** A message as the screen draws it. */
export type ChatMessage = {
  key: string;
  from: "user" | "assistant";
  text: string;
  /** Recipes the tool found on this turn, ranked. Empty when it was not called. */
  recipeIds: string[];
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

/**
 * The ids inside one tool part, if there are any.
 *
 * **Guarded at every step, because the output of a part is genuinely `unknown` at this point.** A
 * tool part exists on the message from the moment the model DECIDES to call the tool, which is
 * before the call has run — so `output` is legitimately absent on a part that will have ids a
 * second later, and reading `output.recipes` straight would throw during the most ordinary moment
 * of the feature. The same guards cover a tool that errored and a shape that changed.
 */
const _idsIn = (part: MessagePart): string[] => {
  const output = part.output;
  if (!output || typeof output !== "object") return [];

  const recipes = (output as { recipes?: unknown }).recipes;
  if (!Array.isArray(recipes)) return [];

  return recipes
    .map((recipe: unknown) =>
      recipe && typeof recipe === "object" ? (recipe as { id?: unknown }).id : undefined,
    )
    .filter((id): id is string => typeof id === "string");
};

/**
 * Every recipe the tool found across a turn, in order, without repeats.
 *
 * A turn may call the tool more than once — the prompt tells the model to try another dish name
 * when the first finds nothing, and `maxSteps` allows it. Two searches for related dishes can
 * return the same recipe, and drawing it twice in one row of cards reads as a bug. First
 * occurrence wins, so the ranking of the earlier search survives the de-duplication.
 */
const _recipeIdsOf = (parts: readonly MessagePart[]): string[] => {
  const ids = parts.filter((part) => part.type === SEARCH_RECIPES_PART).flatMap(_idsIn);

  return [...new Set(ids)];
};

/**
 * Stored messages → what the screen renders.
 *
 * **A `system` message is dropped**, and it is the only kind that is. It is ours rather than the
 * conversation's: the shopper never wrote it and must never read it.
 *
 * **A failed turn is KEPT, deliberately, even though it has nothing to say.** It is tempting to
 * drop a message with no text, no recipes and no stream — it draws as an empty grey bubble — and
 * that is exactly the mistake this used to make. Two things upstream read the transcript to know
 * what is happening: the screen, which owes the shopper an explanation, and the hook, which stops
 * waiting when the answer arrives. Filter the failure out and neither ever learns the turn ended,
 * so the question looks unanswered and "Cuisko is thinking" runs until the app is killed.
 *
 * A streaming message with no text yet is kept for the same family of reasons: it is what the
 * screen hangs its thinking state on, and dropping it would make the answer appear from nowhere
 * several seconds after the question.
 *
 * What IS dropped is the genuinely inert case — an assistant turn with no content, no stream and
 * no failure. There is nothing to say about it and nothing waiting on it.
 */
export const toChatMessages = (messages: readonly SourceMessage[]): ChatMessage[] =>
  messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      key: message.key,
      from: message.role === "user" ? ("user" as const) : ("assistant" as const),
      text: message.text,
      recipeIds: _recipeIdsOf(message.parts),
      isStreaming: message.status === "streaming",
      hasFailed: message.status === "failed",
      createdAt: message._creationTime,
    }))
    .filter(
      (message) =>
        message.text.length > 0 ||
        message.recipeIds.length > 0 ||
        message.isStreaming ||
        message.hasFailed,
    );
