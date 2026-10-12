import { afterEach, describe, expect, test, vi } from "vitest";

import { rejectionCodeOf } from "../../__tests__/convexError.fixtures";
import { transcribe } from "../transcribe";

/**
 * The transport, against a stubbed `fetch`. The request is worth pinning because OpenRouter's JSON
 * body is strict: a URL instead of `input_audio` was refused with a 400 on 2026-10-05. The parse is
 * worth pinning because a body with no text must throw, not reach the recipe as an empty transcript.
 */

const VIDEO = { base64: "AAAAIGZ0eXBpc29t", mediaType: "video/mp4" };

const bodyOf = (fetched: ReturnType<typeof answering>) => {
  const [, init] = fetched.mock.calls[0] as unknown as [string, RequestInit];
  return JSON.parse(init.body as string) as Record<string, unknown>;
};

const answering = (body: unknown, status = 200) => {
  const fetched = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetched);

  return fetched;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("transcribe", () => {
  test("sends the file inline to Whisper large-v3 turbo, its format read off the media type", async () => {
    const fetched = answering({ text: "Preheat the oven to 200." });

    await transcribe(VIDEO);

    expect(bodyOf(fetched)).toEqual({
      model: "openai/whisper-large-v3-turbo",
      input_audio: { data: "AAAAIGZ0eXBpc29t", format: "mp4" },
    });
  });

  test("uses the model a caller names instead", async () => {
    const fetched = answering({ text: "Preheat the oven to 200." });

    await transcribe({ ...VIDEO, model: "deepgram/nova-3" });

    expect(bodyOf(fetched)).toMatchObject({ model: "deepgram/nova-3" });
  });

  test("returns what was said, without the padding Whisper puts around it", async () => {
    answering({ text: " Preheat the oven to 200.  Then the pastry. ", usage: { seconds: 6.4, cost: 0.0002 } });

    expect(await transcribe(VIDEO)).toBe("Preheat the oven to 200.  Then the pastry.");
  });

  test("hands OpenRouter's own cost to `report`, for the caller to record against its trace", async () => {
    answering({ text: "Preheat the oven to 200.", usage: { seconds: 6.4, cost: 0.0002 } });
    const report = vi.fn();

    await transcribe({ ...VIDEO, report });

    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ model: "openai/whisper-large-v3-turbo", costUsd: 0.0002 }),
    );
  });

  test("a reply with no usage is reported with no cost, and still transcribed", async () => {
    answering({ text: "Preheat the oven to 200." });
    const report = vi.fn();

    expect(await transcribe({ ...VIDEO, report })).toBe("Preheat the oven to 200.");
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ costUsd: null }));
  });

  test("throws EXTERNAL_SERVICE_ERROR on a non-200", async () => {
    answering({ error: { message: "The selected model does not support audio from a URL." } }, 400);

    expect(await rejectionCodeOf(transcribe(VIDEO))).toBe("EXTERNAL_SERVICE_ERROR");
  });

  test("throws EXTERNAL_SERVICE_ERROR on a body with no text, rather than an empty transcript", async () => {
    answering({ usage: { seconds: 6.4 } });

    expect(await rejectionCodeOf(transcribe(VIDEO))).toBe("EXTERNAL_SERVICE_ERROR");
  });
});
