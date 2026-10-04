"use node";
import { jsonSchema, zodSchema } from "ai";
import { ConvexError } from "convex/values";
import * as z from "zod/v4";

import { SUPPORTED_LOCALES } from "@shared/translations";
import { httpsDownloadVideo } from "@convex/lib/socialVideo/httpsGet";

import { createTool, providerSchema, wrapAgent } from "../utils";
import { videoRecipesAgent } from "../agents";
import { extractVideoRecipePrompt } from "../config/prompts/extractVideoRecipe";
import { modelRecipeSchema, type SanitizedRecipe, toSanitizedRecipe } from "./sanitizeRecipe";

/**
 * The largest video we download, for the platforms whose CDN the model cannot fetch (TikTok). A
 * short is 5 to 15 MB; 50 MB is ~67 MB of base64, which a Node action's 512 MiB holds with room,
 * and past it the cook gets `VIDEO_TOO_LARGE` instead of a crash.
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
 * fields minimally, MiMo writes timings of 0, which the recipe schema refuses, so the SDK threw
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

/**
 * How this video can reach the model, which is the platform's fact (`SocialVideo.videoHeaders`):
 *
 * - **No headers** (Instagram): the URL itself. The model downloads the video on its side and it
 *   never enters Convex.
 * - **Headers** (TikTok): its CDN answers 403 to anyone without the page's cookies, the model's
 *   fetcher included, so we download it here, with them, and send it inline. Encoded with `Buffer`
 *   in one pass and handed on as a STRING, never the bytes: the AI SDK encodes bytes by appending
 *   one character per byte, which V8 keeps as rope nodes, and on 2026-10-04 that cost +490 MB for a
 *   13 MB video and crashed the action at Node's 512 MB. As a string it costs about +35 MB.
 *
 * Exported for `extractVideoRecipe.manual.test.ts`, so the run you pay for sends what the tool sends.
 */
export const videoPartOf = async ({
  videoUrl,
  videoHeaders,
}: {
  videoUrl: string;
  videoHeaders?: Record<string, string>;
}): Promise<VideoPart> => {
  if (!videoHeaders) return { url: videoUrl };

  const { bytes, mediaType } = await httpsDownloadVideo(videoUrl, videoHeaders, { maxBytes: MAX_VIDEO_BYTES });
  return { base64: bytes.toString("base64"), mediaType };
};

/**
 * What the model is shown: the caption as text, then the video as a file part.
 *
 * A URL part reaches OpenRouter as `video_url: { url }` untouched only because `models.videoRecipes`
 * declares `video/*` URLs as supported; without that the AI SDK would download it here and inline
 * it, which is the crash above. A base64 part reaches it as a `data:` URL.
 */
export const videoRecipeMessages = (caption: string, video: VideoPart) => [
  {
    role: "user" as const,
    content: [
      {
        type: "text" as const,
        text: caption.trim()
          ? `The creator's caption, as posted:\n${caption}`
          : "The creator posted no caption. Everything is in the video.",
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
 * **When the video is downloaded, it never leaves this function**: never an argument (Node actions
 * stop at 5 MiB), a return value (16 MiB) or a row (1 MiB). Callers pass a URL and get a recipe.
 *
 * **Node runtime only** (`"use node"`): the download goes through `node:https`, and an inline video
 * is ~17 MB of request per 13 MB of file, against the default runtime's 64 MiB.
 *
 * `saveMessages: "none"`, as in `sanitizeRecipe`: a transformation, not a conversation.
 *
 * If a future model refuses URLs altogether (as Meta's Muse Spark did with `media_url_not_fetchable`,
 * and Qwen 3.8 Omni with `Download multimodal file timed out`), make `videoPartOf` download every
 * video, not only those with headers, and drop the `video/*` override in `models.videoRecipes`.
 */
export const extractVideoRecipe = createTool({
  description:
    "Watch a cooking video, listen to it and read its caption, and return the complete structured " +
    "recipe it teaches. Returns ingredient names, not catalog ids.",
  inputSchema: _inputSchema,
  execute: async (ctx, { locale, caption, videoUrl, videoHeaders }): Promise<SanitizedRecipe> => {
    const video = await videoPartOf({ videoUrl, videoHeaders });

    const result = await wrapAgent(videoRecipesAgent).generateObject(
      ctx,
      {},
      {
        system: extractVideoRecipePrompt(locale),
        messages: videoRecipeMessages(caption, video),
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
