import type { Id } from "@convex/_generated/dataModel";
import type { ActionCtx } from "@convex/procedures";
import type { Locale } from "@shared/translations";

import { assistantAgent } from "../../agent/agents";
import { assistantPrompt } from "../../agent/config/prompts/assistant";
import { searchRecipesTool } from "../../agent/tools/searchRecipes";
import { appendBrief } from "./appendBrief";

type Args = {
  threadId: string;
  /**
   * The message the shopper just sent, already saved. The model answers THIS one rather than being
   * handed the text again — which is what keeps the saved message and the answered message the
   * same object even if the two ever arrive out of order.
   */
  promptMessageId: string;
  userId: Id<"users">;
  locale: Locale;
  /** What the household can cook with, and the cook's clock — `turnBrief`, read when they pressed send. */
  brief: string;
};

/**
 * One assistant turn, streamed into the thread.
 *
 * **It streams rather than generates, and that choice is the reason the whole feature has a thread
 * behind it.** `saveStreamDeltas` writes the answer to the component as it arrives, and the
 * client's `listMessages` query syncs those deltas over its existing websocket — so text appears
 * while the model is still producing it, with no HTTP streaming endpoint and no polling. A shopper
 * asking a question at 7pm watches an answer appear; the same call awaited would be four seconds
 * of nothing and then a paragraph.
 *
 * **The prompt and the tools are supplied here, not bound to the agent.** Both depend on who is
 * asking and in what language: the prompt because Cuisko answers in the app's display language,
 * and the tool because the recipe search ranks the caller's own recipes first. An agent carrying
 * either would carry one shopper's and hand it to the next.
 *
 * **It does not catch.** A failed turn must leave a failed message on the thread rather than a
 * silent one — the component marks the message failed when the action throws, and the screen reads
 * that status. Swallowing it here would leave the shopper watching a spinner that never resolves,
 * which is strictly worse than an error they can retry past.
 */
export const answerTurn = async (
  ctx: ActionCtx,
  { threadId, promptMessageId, userId, locale, brief }: Args,
): Promise<void> => {
  const result = await assistantAgent.streamText(
    ctx,
    { threadId, userId },
    {
      promptMessageId,
      instructions: assistantPrompt(locale),
      tools: { searchRecipes: searchRecipesTool({ userId, locale }) },
    },
    {
      saveStreamDeltas: true,
      /**
       * The default order, with the brief once, at the end of the question — see `appendBrief`.
       * Only the LAST prompt message takes it: with `promptMessageId` that is the one saved
       * question, and if the prompt ever holds more, the brief still lands once, last. An earlier
       * user message in `recent` stays exactly as it was cached.
       */
      contextHandler: async (_ctx, { search, recent, inputMessages, inputPrompt, existingResponses }) => [
        ...search,
        ...recent,
        ...inputMessages,
        ...inputPrompt.slice(0, -1),
        ...inputPrompt.slice(-1).map((message) => appendBrief(message, brief)),
        ...existingResponses,
      ],
    },
  );

  /**
   * The stream is consumed to completion before the action returns. Without this the action
   * finishes while the model is still talking, Convex tears the context down, and the answer is
   * truncated wherever it happened to be — a failure that looks like the model stopping mid-word.
   */
  await result.consumeStream();
};
