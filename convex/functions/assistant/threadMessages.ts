import type { Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";
import type { StreamArgs, SyncStreamsReturnValue } from "@convex-dev/agent";
import type { PaginationOptions, PaginationResult } from "convex/server";

import { assistantAgent } from "../../agent/agents";
import { ownedThread } from "./ownedThread";

type Args = {
  threadId: string;
  userId: Id<"users">;
  paginationOpts: PaginationOptions;
  streamArgs: StreamArgs | undefined;
};

/** What `useThreadMessages` expects back: a page of finished messages, plus any live deltas. */
type ThreadMessages = PaginationResult<Awaited<
  ReturnType<typeof assistantAgent.listMessages>
>["page"][number]> & {
  streams: SyncStreamsReturnValue | undefined;
};

/** The answer for a thread that is not there, or not yours. One page, empty, already done. */
const _NOTHING = {
  page: [],
  isDone: true,
  continueCursor: "",
  streams: undefined,
} satisfies ThreadMessages;

/**
 * A thread's messages and its live deltas, for the one caller allowed to read them.
 *
 * **The ownership check is the point of this function.** `assistantAgent.listMessages` will happily
 * return any thread's messages to anyone who names it — it is a component read, and the component
 * has no idea who our users are. So the guard comes first and the read only happens after it: see
 * `ownedThread`, which is the single place that comparison is written.
 *
 * **An empty page is the answer to every failure**, and that is deliberate rather than lazy. The
 * common case by far is a client holding a threadId whose window has closed, which is not an error
 * and must not draw one — the modal opens ready for a new question. A stranger's threadId gets
 * exactly the same answer, so nothing here tells an attacker which ids exist.
 *
 * `streams` travels in the same payload as `page` because `useThreadMessages` reads both from one
 * query result: the finished messages set the transcript, the deltas advance the one still being
 * written. Splitting them across two queries would mean two subscriptions that can disagree about
 * which message is live.
 */
export const threadMessages = async (
  ctx: QueryCtx,
  { threadId, userId, paginationOpts, streamArgs }: Args,
): Promise<ThreadMessages> => {
  const thread = await ownedThread(ctx, { threadId, userId });

  if (!thread) return _NOTHING;

  const [messages, streams] = await Promise.all([
    assistantAgent.listMessages(ctx, { threadId, paginationOpts }),
    assistantAgent.syncStreams(ctx, { threadId, streamArgs }),
  ]);

  return { ...messages, streams };
};
