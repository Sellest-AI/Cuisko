"use node";
import { fetchVideo } from "@convex/agent/tools/extractVideoRecipe";
import { type RecordingCtx, traceOpenRouter } from "@convex/functions/tracing/recordGeneration";
import { transcribe } from "@convex/lib/openrouter/transcribe";
import { fetchSocialVideo } from "@convex/lib/socialVideo/fetchSocialVideo";
import type { SocialVideoSource } from "@convex/lib/socialVideo/types";
import { ConvexError } from "convex/values";

/** The words of a post: what a verifier that cannot watch a video is shown of it. */
export type VideoPost = { caption: string; transcript: string };

const _unverifiable = (message: string) => new ConvexError({ code: "UNREADABLE_PAGE" as const, message });

/**
 * The caption of a post and what is said in its video, read fresh from the platform. The video is
 * downloaded for the transcription and dropped here: only the two strings go back.
 *
 * A verify needs both, and one alone would mark the recipe `reviewed` on half of the evidence. So no
 * caption refuses, before the download and the transcription are paid for; nothing said refuses; and
 * a failed transcription rejects, where an import carries on with `transcriptOf`'s `null`, because an
 * import still has the frames.
 *
 * @limitation A video `transcribe` can never finish, past its 60 s abort at about 7 minutes long, and
 *   a video with nothing said, whose caption may hold the whole recipe, imported fine and can never be
 *   verified. Each try spends a `recipeWrite` token (ADR 0018).
 */
export const readVideoPost = async (
  ctx: RecordingCtx,
  { source }: { source: SocialVideoSource },
): Promise<VideoPost> => {
  const { caption, videoUrl, videoHeaders } = await fetchSocialVideo(source);
  if (!caption.trim()) throw _unverifiable("This post has no caption");

  const { base64, mediaType } = await fetchVideo({ videoUrl, videoHeaders });
  const transcript = await transcribe({ base64, mediaType, report: traceOpenRouter(ctx, "transcribe") });
  if (!transcript) throw _unverifiable("Nothing is said in this video");

  return { caption, transcript };
};
