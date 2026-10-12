import { ConvexError } from "convex/values";
import * as z from "zod/v4";

import { env } from "@convex/env";
import type { ReportUsage } from "@convex/lib/typesafe/ask";

const ENDPOINT = "https://openrouter.ai/api/v1/audio/transcriptions";

/**
 * $0.0002 and 9 s for a 66 s reel sent inline as MP4 (2026-10-05), and it heard the time the
 * caption got wrong. It refuses a URL: send the bytes.
 */
const DEFAULT_MODEL = "openai/whisper-large-v3-turbo";

/** A minute-long reel took 9 s. Past a minute, the import is better off without the transcript. */
const TIMEOUT_MS = 60_000;

/**
 * `usage` is loose on purpose, as `ask.ts`'s is: a usage field we fail to read must not fail a
 * transcription that came back. OpenRouter adds `cost` when it knows it.
 */
const _responseSchema = z.object({
  text: z.string(),
  usage: z
    .object({ cost: z.number().optional(), input_tokens: z.number().optional(), output_tokens: z.number().optional() })
    .optional()
    .catch(undefined),
});

const _unreachable = (message: string) => new ConvexError({ code: "EXTERNAL_SERVICE_ERROR" as const, message });

/**
 * What is said in an audio or video file, as plain text, through OpenRouter's speech-to-text endpoint.
 *
 * The file goes inline, as base64: the models there that take a URL are not the cheap ones.
 * The format is the media type's subtype (`video/mp4` → `mp4`); an MP4 is read as is, so no audio
 * track has to be extracted first.
 *
 * Throws `EXTERNAL_SERVICE_ERROR` on a timeout, a non-200, or a body with no `text`. `report` is
 * handed what the call used once the body parses, for the caller to record against its trace.
 */
export const transcribe = async ({
  model = DEFAULT_MODEL,
  base64,
  mediaType,
  report,
}: {
  model?: string;
  base64: string;
  mediaType: string;
  report?: ReportUsage;
}): Promise<string> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, input_audio: { data: base64, format: mediaType.split("/").pop() } }),
      signal: controller.signal,
    });

    if (!response.ok) throw _unreachable(`Transcription answered ${response.status}: ${await response.text()}`);

    const parsed = _responseSchema.safeParse(await response.json());
    if (!parsed.success) throw _unreachable(`Transcription returned no text: ${parsed.error.message}`);

    const { usage } = parsed.data;
    await report?.({
      model,
      inputTokens: usage?.input_tokens,
      outputTokens: usage?.output_tokens,
      costUsd: usage?.cost ?? null,
      latencyMs: Date.now() - startedAt,
    });

    return parsed.data.text.trim();
  } catch (error) {
    if (controller.signal.aborted) throw _unreachable("Transcription took too long");
    throw error;
  } finally {
    clearTimeout(timer);
  }
};
