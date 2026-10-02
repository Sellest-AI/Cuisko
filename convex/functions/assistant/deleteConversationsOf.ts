import { components } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";

type DeleteCtx = Pick<MutationCtx, "runMutation">;

/**
 * Deletes every conversation `userId` had with the assistant: threads, messages and streams.
 *
 * Free text a cook typed to the assistant is the most identifying thing the app holds, so an account
 * deletion takes all of it. The component does the work in pages, scheduling itself until it is
 * done, so a long history does not have to fit in the caller's transaction.
 *
 * Reaches the agent component directly, which C13 allows only for audited files. It reads nothing
 * and takes no `threadId`: the user id comes from the server, never from a client, so there is no
 * thread here that `ownedThread` would need to vouch for.
 *
 * @limitation The photos sent in these conversations are not deleted here. A message holds only the
 * image's URL; the file is an `images` row the cook claims through `userImages` (see `saveQuestion`).
 * Today only an account deletion removes them, through `purgeUser`, which deletes every image the
 * cook claims, conversation photos included. Deleting a single conversation without deleting the
 * account would leave its photos in the bucket. Whatever adds that has to find them, which means
 * recording the `imageId` on the message rather than reading it back out of a URL.
 */
export const deleteConversationsOf = async (ctx: DeleteCtx, userId: Id<"users">): Promise<void> => {
  await ctx.runMutation(components.agent.users.deleteAllForUserIdAsync, { userId });
};
