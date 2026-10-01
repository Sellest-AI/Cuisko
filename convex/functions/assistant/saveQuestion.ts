import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import { ConvexError } from "convex/values";

import { assistantAgent } from "../../agent/agents";

type Args = {
  threadId: string;
  userId: Id<"users">;
  text: string;
  /** A photo the caller uploaded to go with the question — an `images` row, not a URL. */
  imageId?: Id<"images">;
};

/**
 * The cook's question, saved on the thread: the words, and the photo when there is one.
 *
 * **It takes an image id and reads the URL itself, rather than accepting a URL.** A URL from the
 * client would be handed to the model provider to fetch, so any address would do — the app would
 * be asking a third party to request whatever a caller typed. An id can only name a row, and the
 * `userImages` claim below says whether that row is the caller's: the same upload that made the
 * file recorded who made it.
 *
 * The image goes first in the content, which is the order models read best ("this photo — what can
 * I cook?"). Without a photo the message is the plain `prompt` it always was.
 *
 * `skipEmbeddings` for the reason `sendMessage` gives: a mutation cannot `fetch`.
 *
 * @limitation Design choice: the photo stays a part of the stored message, so every later turn of
 * the thread sends it to the model again and pays for it. Dropping it after the first answer would
 * lose what a follow-up like "and the one on the left?" refers to.
 */
export const saveQuestion = async (ctx: MutationCtx, { threadId, userId, text, imageId }: Args) => {
  if (!imageId) {
    return assistantAgent.saveMessage(ctx, { threadId, userId, prompt: text, skipEmbeddings: true });
  }

  const image = await ctx.db.get(imageId);
  const claims = await ctx.db
    .query("userImages")
    .withIndex("by_image_id", (q) => q.eq("imageId", imageId))
    .collect();

  if (!image || !claims.some((claim) => claim.userId === userId)) {
    throw new ConvexError({ code: "FORBIDDEN" });
  }

  return assistantAgent.saveMessage(ctx, {
    threadId,
    userId,
    message: {
      role: "user",
      content: [
        { type: "file", data: image.url, mediaType: image.mimeType },
        { type: "text", text },
      ],
    },
    skipEmbeddings: true,
  });
};
