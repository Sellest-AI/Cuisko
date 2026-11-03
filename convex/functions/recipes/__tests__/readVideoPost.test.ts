import { beforeEach, describe, expect, it, vi } from "vitest";

import { traceOpenRouter } from "@convex/functions/tracing/recordGeneration";
import { transcribe } from "@convex/lib/openrouter/transcribe";
import { fetchSocialVideo } from "@convex/lib/socialVideo/fetchSocialVideo";
import { httpsDownloadVideo } from "@convex/lib/socialVideo/httpsGet";

import { rejectionCodeOf } from "../../../lib/__tests__/convexError.fixtures";
import { readVideoPost } from "../readVideoPost";

/** The post page, the download and the transcription leave the process; what is tested is what is done with them. */
vi.mock("@convex/lib/socialVideo/fetchSocialVideo", () => ({ fetchSocialVideo: vi.fn() }));
vi.mock("@convex/lib/socialVideo/httpsGet", () => ({ httpsDownloadVideo: vi.fn() }));
vi.mock("@convex/lib/openrouter/transcribe", () => ({ transcribe: vi.fn() }));
const REPORT = vi.hoisted(() => vi.fn());
vi.mock("@convex/functions/tracing/recordGeneration", () => ({ traceOpenRouter: vi.fn(() => REPORT) }));

const SOURCE = { platform: "instagram" as const, id: "abc", canonicalUrl: "https://www.instagram.com/reel/abc/" };
const CTX = { scheduler: {}, trace: null } as unknown as Parameters<typeof readVideoPost>[0];

const _post = (caption: string, videoHeaders?: Record<string, string>) => {
  vi.mocked(fetchSocialVideo).mockResolvedValue({ ...SOURCE, caption, videoUrl: "https://cdn.example.com/reel.mp4", videoHeaders });
};

beforeEach(() => {
  vi.mocked(traceOpenRouter).mockClear();
  vi.mocked(transcribe).mockReset();
  vi.mocked(httpsDownloadVideo).mockReset();
  vi.mocked(httpsDownloadVideo).mockResolvedValue({ bytes: Buffer.from("mp4 bytes"), mediaType: "video/mp4" });
});

describe("readVideoPost", () => {
  it("is the caption and what the transcription heard", async () => {
    _post("400 g of gnocchi");
    vi.mocked(transcribe).mockResolvedValue("Into the pan for twelve minutes.");

    expect(await readVideoPost(CTX, { source: SOURCE })).toEqual({
      caption: "400 g of gnocchi",
      transcript: "Into the pan for twelve minutes.",
    });
  });

  it("downloads a TikTok with the headers its CDN demands", async () => {
    const headers = { Cookie: "tt_chain_token=abc" };
    _post("400 g of gnocchi", headers);
    vi.mocked(transcribe).mockResolvedValue("Into the pan for twelve minutes.");

    await readVideoPost(CTX, { source: SOURCE });

    expect(httpsDownloadVideo).toHaveBeenCalledWith("https://cdn.example.com/reel.mp4", headers, expect.any(Object));
  });

  /** ADR 0019: `report` is optional, so only a test sees a transcription whose cost is recorded nowhere. */
  it("records the transcription as the span `transcribe`", async () => {
    _post("400 g of gnocchi");
    vi.mocked(transcribe).mockResolvedValue("Into the pan for twelve minutes.");

    await readVideoPost(CTX, { source: SOURCE });

    expect(traceOpenRouter).toHaveBeenCalledWith(CTX, "transcribe");
    expect(vi.mocked(transcribe).mock.calls[0]![0].report).toBe(REPORT);
  });

  it("rejects a failed transcription, rather than verifying from half of the post", async () => {
    _post("400 g of gnocchi");
    vi.mocked(transcribe).mockRejectedValue(new Error("Transcription answered 503"));

    await expect(readVideoPost(CTX, { source: SOURCE })).rejects.toThrow("503");
  });

  it("is UNREADABLE_PAGE with a caption over a video with nothing said in it", async () => {
    _post("400 g of gnocchi");
    vi.mocked(transcribe).mockResolvedValue("");

    expect(await rejectionCodeOf(readVideoPost(CTX, { source: SOURCE }))).toBe("UNREADABLE_PAGE");
  });

  it("is UNREADABLE_PAGE with no caption, before downloading or transcribing anything", async () => {
    _post("  ");
    vi.mocked(transcribe).mockResolvedValue("Into the pan for twelve minutes.");

    expect(await rejectionCodeOf(readVideoPost(CTX, { source: SOURCE }))).toBe("UNREADABLE_PAGE");
    expect(httpsDownloadVideo).not.toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
  });
});
