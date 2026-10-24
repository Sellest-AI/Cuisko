import type { Id } from "@convex/_generated/dataModel";
import { traceUsageHandler } from "@convex/functions/tracing/recordGeneration";
import type { TracedActionCtx } from "@convex/procedures";
import { ASSISTANT_TOOLS } from "@shared/assistant";
import type { Locale } from "@shared/translations";

import { assistantAgent } from "../../agent/agents";
import { assistantPrompt } from "../../agent/config/prompts/assistant";
import { addToCellarTool, removeFromCellarTool } from "../../agent/tools/cellar";
import { computeNutritionTool } from "../../agent/tools/computeNutrition";
import { displayTool } from "../../agent/tools/display";
import { findWebRecipeTool } from "../../agent/tools/findWebRecipe";
import { planMealTool } from "../../agent/tools/planMeal";
import { searchIngredientsTool } from "../../agent/tools/searchIngredients";
import { searchRecipesTool } from "../../agent/tools/searchRecipes";
import { showButtonTool } from "../../agent/tools/showButton";
import { showSubstitutionsTool } from "../../agent/tools/showSubstitutions";
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
  /**
   * The household the brief was read for, which the cellar tools write to. Passed rather than looked
   * up from `userId`: a cook who switches household mid-turn must not see Cuisko write to a cellar
   * it never read (ADR 0016).
   */
  householdId: Id<"households">;
  locale: Locale;
  /** What the household can cook with, and the cook's clock — `turnBrief`, read when they pressed send. */
  brief: string;
  /** The cook's clock (`shared/clock.ts`), which the plan tool counts the day of a plate from. */
  today: number;
  now: string;
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
  ctx: TracedActionCtx,
  { threadId, promptMessageId, userId, householdId, locale, brief, today, now }: Args,
): Promise<void> => {
  const result = await assistantAgent.streamText(
    ctx,
    { threadId, userId },
    {
      promptMessageId,
      instructions: assistantPrompt(locale),
      /**
       * Keyed by `ASSISTANT_TOOLS` because the key IS the name the client reads: the SDK stores
       * each call as a `tool-${key}` part, and that is how the screen finds status lines and cards.
       */
      tools: {
        [ASSISTANT_TOOLS.searchRecipes]: searchRecipesTool({ userId, locale }),
        [ASSISTANT_TOOLS.searchIngredients]: searchIngredientsTool({ locale }),
        [ASSISTANT_TOOLS.computeNutrition]: computeNutritionTool({ locale }),
        [ASSISTANT_TOOLS.display]: displayTool,
        [ASSISTANT_TOOLS.showButton]: showButtonTool,
        [ASSISTANT_TOOLS.showSubstitutions]: showSubstitutionsTool,
        [ASSISTANT_TOOLS.addToCellar]: addToCellarTool({ householdId, userId }),
        [ASSISTANT_TOOLS.removeFromCellar]: removeFromCellarTool({ householdId }),
        [ASSISTANT_TOOLS.planMeal]: planMealTool({ householdId, userId, locale, today, now }),
        [ASSISTANT_TOOLS.findWebRecipe]: findWebRecipeTool({ userId, locale }),
      },
      /*
       * No `stopWhen`: the turn ends when the model stops calling tools, capped by the agent's
       * `maxSteps`. Showing something does not end it. Ending the turn on `display` made the
       * model avoid the show tools whenever it still had something to say.
       */
    },
    {
      saveStreamDeltas: true,
      // Every step of the turn is billed, so every step is recorded against the trace `sendMessage`
      // started. Not through `wrapAgent`, which wraps the two calls a tool makes, not a stream.
      usageHandler: traceUsageHandler(ctx),
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
