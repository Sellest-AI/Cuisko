import { internal } from "@convex/_generated/api";
import { answerTurn } from "@convex/functions/assistant/answerTurn";
import { openThread } from "@convex/functions/assistant/openThread";
import { saveQuestion } from "@convex/functions/assistant/saveQuestion";
import { turnBrief } from "@convex/functions/assistant/turnBrief";
import { enforceRateLimit } from "@convex/functions/rateLimits/enforceRateLimit";
import { householdMutationI18n, internalAction } from "@convex/procedures";
import { vLocale } from "@convex/schema/i18n";
import { v } from "convex/values";

/**
 * A question for Cuisko → the thread it landed in, and an answer on its way.
 *
 * **A mutation that schedules, rather than an action that answers.** The shopper's own words have
 * to be on screen in the frame they pressed send; an action streaming for four seconds cannot
 * return in time to put them there. So this saves the message and hands off, the reactive query
 * draws it immediately, and the answer arrives underneath it as deltas. It is the opposite trade
 * from `router/ingredients/resolve.ts`, which awaits precisely because its caller is holding a
 * placeholder with nowhere to put a status.
 *
 * **`threadId` is optional and advisory.** The client says which conversation it thinks it is in;
 * `openThread` decides. It is ignored when it names another cook's thread, when it names nothing,
 * and when the conversation has been idle past `ASSISTANT_IDLE_MS` — the returned id is the one
 * that was actually written to, which is what the client stores.
 *
 * **Household-scoped, because the cellar is.** The brief is read here, in the transaction that
 * saves the question, so the answer works from what the household held when the cook pressed send.
 * `today` and `now` are the cook's clock (`shared/clock.ts`) — the server has no timezone of its own.
 *
 * `I18n` because the answer is locale-sensitive: Cuisko replies in the language the app is
 * displaying, not the one the question happens to be written in (PRODUCT.md § Bilingual by nature).
 */
export const authed = householdMutationI18n({
  args: {
    text: v.string(),
    threadId: v.optional(v.string()),
    /** A photo already uploaded by the caller (`media/images/uploadOne`), sent with the question. */
    imageId: v.optional(v.id("images")),
    today: v.number(),
    now: v.string(),
  },
  returns: v.object({ threadId: v.string() }),
  handler: async (ctx, { text, threadId, imageId, today, now }) => {
    // First, so a refused question saves nothing and schedules no answer.
    await enforceRateLimit(ctx, "assistant");

    const { locale } = ctx.i18n;
    const brief = await turnBrief(ctx, { householdId: ctx.householdId, locale, today, now });
    const thread = await openThread(ctx, { threadId, userId: ctx.userId, now: Date.now() });

    const { messageId } = await saveQuestion(ctx, { threadId: thread, userId: ctx.userId, text, imageId });

    await ctx.scheduler.runAfter(0, internal.router.assistant.sendMessage._internal_answer, {
      threadId: thread,
      promptMessageId: messageId,
      userId: ctx.userId,
      householdId: ctx.householdId,
      locale,
      brief,
      today,
      now,
    });

    return { threadId: thread };
  },
});

/**
 * The turn `authed` scheduled. Internal because it is one step of that operation and carries no
 * identity of its own — every argument it trusts was established by the mutation that scheduled it.
 *
 * @costly
 */
export const _internal_answer = internalAction({
  args: {
    threadId: v.string(),
    promptMessageId: v.string(),
    userId: v.id("users"),
    householdId: v.id("households"),
    locale: vLocale,
    brief: v.string(),
    today: v.number(),
    now: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await answerTurn(ctx, args);
  },
});
