import { components } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "@convex/procedures";
import type { ThreadDoc } from "@convex-dev/agent";

type ThreadCtx = Pick<QueryCtx | MutationCtx | ActionCtx, "runQuery">;

type Args = {
  threadId: string;
  userId: Id<"users">;
};

/**
 * A conversation thread, but only if it is the caller's. `null` for every other answer.
 *
 * ⚠️ **This is the authorization check for the whole assistant, and nothing mechanical enforces
 * that it gets called.** A thread lives in the `@convex-dev/agent` component, not in one of our
 * tables, so `ownedMutation('threads')` cannot exist and ADR 0003's machinery does not reach it.
 * The ownership comparison has to be written by hand, which means it can be forgotten by hand —
 * and a `threadId` is a client-supplied string that names somebody's private conversation. Every
 * read or continuation of a thread goes through here. There is no second way in.
 *
 * It matters more than it would have under the design this replaced: threads used to be deleted
 * fifteen minutes after their last message, so a leaked id went stale. Nothing is deleted now, so
 * an id that reads one conversation reads it for good.
 *
 * **`null` rather than a throw, for all three failure modes.** A thread that never existed, one
 * that belongs to another cook, and one whose id the client simply got wrong are the same answer
 * to the caller: there is no conversation here, start one. Distinguishing them in the return value
 * would be telling an attacker which ids are real, and distinguishing them in an error message
 * would put that on a screen. The callers are written for `null` — `openThread` makes a new thread
 * and `threadMessages` answers empty — so this never needs a catch.
 *
 * `runQuery` against the component rather than `agent.getThreadMetadata`, which throws when the
 * thread is missing. Missing is ordinary here, not exceptional: every shopper reopening the modal
 * on a threadId the server has since moved past hits it.
 */
/**
 * The thread row, or `null` — including when the id is not even shaped like one.
 *
 * **The catch is load-bearing, and it took a test to find.** `threadId` arrives as a plain string
 * from the client, and the component's own query validates it as `v.id("threads")` — so a string
 * that is not a well-formed id does not come back empty, it throws a validator error out of the
 * query. That is reachable in ordinary use: an id kept from another deployment, or from an older
 * build. Unhandled, it crashes the assistant screen's subscription for a shopper whose only
 * mistake was having the app open across a deploy.
 *
 * A malformed id and a deleted one mean exactly the same thing to every caller here — there is no
 * conversation at this id — so they get the same answer. It fails closed: `null` is the denying
 * answer, so a genuine fault can only ever cost a conversation, never expose one.
 */
const _readThread = async (ctx: ThreadCtx, threadId: string): Promise<ThreadDoc | null> => {
  try {
    return await ctx.runQuery(components.agent.threads.getThread, { threadId });
  } catch {
    return null;
  }
};

export const ownedThread = async (
  ctx: ThreadCtx,
  { threadId, userId }: Args,
): Promise<ThreadDoc | null> => {
  const thread = await _readThread(ctx, threadId);

  if (!thread) return null;

  /**
   * A thread with no `userId` is anonymous, and this app creates none — every thread is opened by
   * `openThread` with the caller's id on it. So the comparison rejects `undefined` as firmly as it
   * rejects somebody else's, rather than reading a missing owner as "no owner, therefore mine".
   */
  return thread.userId === userId ? thread : null;
};
