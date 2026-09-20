import { threadMessages } from "@convex/functions/assistant/threadMessages";
import { authQuery } from "@convex/procedures";
import { vStreamArgs } from "@convex-dev/agent";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

/**
 * One conversation, as the assistant screen draws it: a page of messages and the deltas of the one
 * still being written.
 *
 * `authQuery` and not `ownedQuery`: a thread is not a row in one of our tables — it belongs to the
 * `@convex-dev/agent` component — so the ownership check cannot be bound to the builder and is
 * made inside `threadMessages` instead. **That is the one authorization hole in this feature that
 * nothing mechanical catches**, which is why the check lives in a single named function with its
 * own tests rather than as an `if` here.
 *
 * No `I18n` variant: a message is stored in the language it was written in, and nothing here
 * resolves a localized field. The locale matters when the answer is GENERATED, which is
 * `sendMessage`'s business.
 *
 * `vStreamArgs` and `paginationOptsValidator` are the shapes `useThreadMessages` sends; neither is
 * ours to design, and restating either by hand is how a client and a server stop agreeing.
 */
export const authed = authQuery({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  handler: (ctx, { threadId, paginationOpts, streamArgs }) =>
    threadMessages(ctx, { threadId, userId: ctx.userId, paginationOpts, streamArgs }),
});
