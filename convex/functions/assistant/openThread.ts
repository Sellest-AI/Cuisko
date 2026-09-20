import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import { isConversationStale } from "@shared/assistant";
import type { ThreadDoc } from "@convex-dev/agent";

import { assistantAgent } from "../../agent/agents";
import { ownedThread } from "./ownedThread";

type Args = {
  /** The thread the client believes it is continuing. Absent on a first message. */
  threadId?: string;
  userId: Id<"users">;
  /** The clock, passed in so this is testable without one. */
  now: number;
};

/**
 * When a thread last saw a message — or, if it has never seen one, when it was made.
 *
 * The fallback is not a formality: a thread whose very first send failed between creating it and
 * saving the message has no messages at all, and reading that as activity at instant zero would
 * make it permanently stale — a thread the client holds, the server refuses to continue, and
 * nothing ever cleans up. Its creation time is the honest answer to "when did anything last
 * happen here".
 *
 * One message, newest first, which is what `listMessages` returns by default.
 */
const _lastActivityOf = async (ctx: MutationCtx, thread: ThreadDoc): Promise<number> => {
  const { page } = await assistantAgent.listMessages(ctx, {
    threadId: thread._id,
    paginationOpts: { numItems: 1, cursor: null },
  });

  return page[0]?._creationTime ?? thread._creationTime;
};

/**
 * The thread this message belongs in — the one the client is holding, or a new one.
 *
 * **The idle window is enforced here and nowhere else that counts.** The client does its own
 * comparison so it can avoid drawing a conversation that has gone cold, but that is a rendering
 * decision made on a phone's clock; this is the one that decides what actually gets appended to.
 * A client that was backgrounded for an hour, or whose clock is wrong, or that simply kept a
 * threadId in memory, cannot talk its way back into a conversation the window has closed.
 *
 * **Nothing is deleted when a thread ages out.** It keeps every message it ever had and simply
 * stops being written to — the shopper gets a new thread, and the old one sits there complete.
 * That is what makes a "past conversations" screen additive later rather than a recovery job.
 *
 * Four ways in, one way out:
 *
 *   - no `threadId` at all — a first message. New thread.
 *   - a `threadId` that is not the caller's, or does not exist. New thread, silently: see
 *     `ownedThread` for why this is not an error.
 *   - a `threadId` whose last message is older than the window. New thread, old one untouched.
 *   - anything else. That thread, continued.
 */
export const openThread = async (ctx: MutationCtx, { threadId, userId, now }: Args): Promise<string> => {
  const existing = threadId ? await ownedThread(ctx, { threadId, userId }) : null;

  if (existing && !isConversationStale(await _lastActivityOf(ctx, existing), now)) {
    return existing._id;
  }

  const { threadId: opened } = await assistantAgent.createThread(ctx, { userId });

  return opened;
};
