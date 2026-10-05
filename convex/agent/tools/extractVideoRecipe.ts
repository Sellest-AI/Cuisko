"use node";
import { jsonSchema, zodSchema } from "ai";
import { ConvexError } from "convex/values";
import * as z from "zod/v4";

import { SUPPORTED_LOCALES } from "@shared/translations";
import { transcribe } from "@convex/lib/openrouter/transcribe";
import { httpsDownloadVideo } from "@convex/lib/socialVideo/httpsGet";

import { createTool, providerSchema, wrapAgent } from "../utils";
import { videoRecipesAgent } from "../agents";
import { extractVideoRecipePrompt } from "../config/prompts/extractVideoRecipe";
import { modelRecipeSchema, type SanitizedRecipe, toSanitizedRecipe } from "./sanitizeRecipe";

/**
 * The largest video we download, which is every one: the transcription needs the file. A short is
 * 5 to 15 MB; 50 MB is ~67 MB of base64, which a Node action's 512 MiB holds with room, and past
 * it the cook gets `VIDEO_TOO_LARGE` instead of a crash.
 */
export const MAX_VIDEO_BYTES = 50_000_000;

const _inputSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES).describe("The language every field of the result is written in."),
  caption: z.string().describe("The creator's own caption, as posted. May be empty."),
  videoUrl: z.string().describe("The video's signed https CDN address."),
  videoHeaders: z
    .record(z.string(), z.string())
    .optional()
    .describe("Headers its CDN demands (cookies, Referer). Present means the model cannot fetch it alone."),
});

/**
 * `modelRecipeSchema` with a verdict in front: does this video teach a dish at all?
 *
 * The recipe fields are all required, so a dance reel or a restaurant review still comes back as a
 * recipe-shaped answer, invented to fill them. Asked first, before any recipe field, so the model
 * decides on the video rather than on what it just wrote. The typed-recipe schema is left alone:
 * a cook who types a recipe is not asked whether it is one.
 */
export const videoRecipeSchema = z.object({
  teachesRecipe: z
    .boolean()
    .describe(
      "true only if the video shows or tells how to cook a dish or a drink. false for anything else " +
        "(a restaurant visit, a taste test, a haul, a vlog, a sketch), even when food is on screen. " +
        "When false, the other fields are ignored: fill them minimally.",
    ),
  ...modelRecipeSchema.shape,
});

/**
 * `videoRecipeSchema` as the AI SDK is handed it: the same JSON for the provider, and NO validation
 * on the way back, which `toVideoRecipe` does instead.
 *
 * Validated by the SDK, a "no recipe" answer never reached its verdict: told to fill the other
 * fields minimally, MiMo wrote timings of 0, which the recipe schema refuses, so the SDK threw
 * `AI_NoObjectGeneratedError` and the cook was told the service was down (2026-10-05, on a real
 * reel). Nothing is lost by skipping it: `toSanitizedRecipe` parses the full schema again anyway.
 */
export const videoRecipeOutputSchema = jsonSchema<unknown>(() => zodSchema(providerSchema(videoRecipeSchema)).jsonSchema);

/**
 * The model's answer as a recipe, or `NOT_A_RECIPE` when it says the video teaches none.
 *
 * Anything but an explicit `true` refuses: an answer missing its verdict has not vouched for the
 * recipe, and a made-up one would be saved and served to every cook who shares that video
 * (`importVideo`'s dedupe is global). The verdict is read off the raw answer, and the recipe by
 * `toSanitizedRecipe`, whose schema ignores the extra field.
 */
export const toVideoRecipe = (raw: unknown): SanitizedRecipe => {
  const teachesRecipe = typeof raw === "object" && raw !== null && "teachesRecipe" in raw && raw.teachesRecipe;
  if (teachesRecipe !== true) {
    throw new ConvexError({ code: "NOT_A_RECIPE" as const, message: "This video teaches no recipe" });
  }
  return toSanitizedRecipe(raw);
};

/** The video as the model receives it: a URL it fetches itself, or the file inline. */
export type VideoPart = { url: string } | { base64: string; mediaType: string };

/** A downloaded video: the file for the transcription, and the part for the model. */
export type FetchedVideo = { base64: string; mediaType: string; part: VideoPart };

/**
 * The video, downloaded here, with the part the model gets, which is the platform's fact
 * (`SocialVideo.videoHeaders`):
 *
 * - **No headers** (Instagram): the URL itself. The model downloads the video on its side.
 * - **Headers** (TikTok): its CDN answers 403 to anyone without the page's cookies, the model's
 *   fetcher included, so it gets the file we downloaded, inline.
 *
 * A failed download fails the import, even for Instagram, whose URL alone would reach the model: a
 * video we cannot fetch is one we cannot transcribe, and a recipe without what is said gets times
 * wrong. A failed transcription does not (`transcriptOf`), since a silent or music-only video
 * cannot be told from it.
 *
 * Encoded with `Buffer` in one pass and handed on as a STRING, never the bytes: the AI SDK encodes
 * bytes by appending one character per byte, which V8 keeps as rope nodes, and on 2026-10-04 that
 * cost +490 MB for a 13 MB video and crashed the action at Node's 512 MB. As a string it costs
 * about +35 MB.
 *
 * Exported for `extractVideoRecipe.manual.test.ts`, so the run you pay for sends what the tool sends.
 */
export const fetchVideo = async ({
  videoUrl,
  videoHeaders,
}: {
  videoUrl: string;
  videoHeaders?: Record<string, string>;
}): Promise<FetchedVideo> => {
  const { bytes, mediaType } = await httpsDownloadVideo(videoUrl, videoHeaders ?? {}, { maxBytes: MAX_VIDEO_BYTES });
  const base64 = bytes.toString("base64");

  return { base64, mediaType, part: videoHeaders ? { base64, mediaType } : { url: videoUrl } };
};

/**
 * What the creator says, or `null` when the transcription fails. A transcript improves the recipe
 * (a time said aloud that the caption gets wrong); without it the model still has the frames and
 * the caption, as before transcripts existed, so a failure here never fails the import.
 */
export const transcriptOf = async ({ base64, mediaType }: FetchedVideo): Promise<string | null> => {
  try {
    return await transcribe({ base64, mediaType });
  } catch (error) {
    console.warn("extractVideoRecipe: transcription failed, importing without it", error);
    return null;
  }
};

/**
 * What the model is shown: the caption and the transcript as text, then the video as a file part.
 *
 * A URL part reaches OpenRouter as `video_url: { url }` untouched only because `models.videoRecipes`
 * declares `video/*` URLs as supported; without that the AI SDK would download it here and inline
 * it, which is the crash above. A base64 part reaches it as a `data:` URL.
 */
export const videoRecipeMessages = (caption: string, transcript: string | null, video: VideoPart) => [
  {
    role: "user" as const,
    content: [
      {
        type: "text" as const,
        text: caption.trim()
          ? `The creator's caption, as posted:\n${caption}`
          : "The creator posted no caption. Everything is in the video.",
      },
      {
        type: "text" as const,
        text: transcript
          ? `What is said in the video, transcribed by machine:\n${transcript}`
          : "Nothing said in the video could be transcribed.",
      },
      "url" in video
        ? { type: "file" as const, data: new URL(video.url), mediaType: "video/mp4" }
        : { type: "file" as const, data: video.base64, mediaType: video.mediaType },
    ],
  },
];

/**
 * A recipe video and its caption into a complete recipe, in one model call and one language.
 *
 * The output is a `SanitizedRecipe`, the same shape `sanitizeRecipe` returns and parsed by the same
 * `toSanitizedRecipe`, so everything after it (ingredient resolution, the insert, translations,
 * images) cannot tell a video import from a typed recipe.
 *
 * A video that teaches no dish never gets that far: `toVideoRecipe` refuses it with `NOT_A_RECIPE`
 * first, so no row is written for it.
 *
 * **The downloaded video never leaves this function**: never an argument (Node actions
 * stop at 5 MiB), a return value (16 MiB) or a row (1 MiB). Callers pass a URL and get a recipe.
 *
 * **Node runtime only** (`"use node"`): the download goes through `node:https`, and an inline video
 * is ~17 MB of request per 13 MB of file, against the default runtime's 64 MiB.
 *
 * `saveMessages: "none"`, as in `sanitizeRecipe`: a transformation, not a conversation.
 *
 * If a future model refuses URLs altogether (as Meta's Muse Spark did with `media_url_not_fetchable`),
 * make `fetchVideo` return the inline part for every video, since it already holds the file, and
 * drop the `video/*` override in `models.videoRecipes`.
 */
export const extractVideoRecipe = createTool({
  description:
    "Watch a cooking video, listen to it and read its caption, and return the complete structured " +
    "recipe it teaches. Returns ingredient names, not catalog ids.",
  inputSchema: _inputSchema,
  execute: async (ctx, { locale, caption, videoUrl, videoHeaders }): Promise<SanitizedRecipe> => {
    const video = await fetchVideo({ videoUrl, videoHeaders });
    // GLM cannot hear the video. Drop the transcript once `models.videoRecipes` takes audio input.
    const transcript = await transcriptOf(video);

    const result = await wrapAgent(videoRecipesAgent).generateObject(
      ctx,
      {},
      {
        system: extractVideoRecipePrompt(locale),
        messages: videoRecipeMessages(caption, transcript, video.part),
        schema: videoRecipeOutputSchema,
        output: "object",
        maxRetries: 2,
      },
      { storageOptions: { saveMessages: "none" } },
    );

    // Same reason as in `sanitizeRecipe`: `wrapAgent` erases the schema's type on the way through.
    return toVideoRecipe(result.object);
  },
});
