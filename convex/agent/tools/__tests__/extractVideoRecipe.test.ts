import { beforeEach, describe, expect, it, vi } from "vitest";

import { codeOf } from "../../../lib/__tests__/convexError.fixtures";
import { transcribe } from "@convex/lib/openrouter/transcribe";
import { httpsDownloadVideo } from "@convex/lib/socialVideo/httpsGet";

import {
  fetchVideo,
  toVideoRecipe,
  transcriptOf,
  videoRecipeMessages,
  videoRecipeOutputSchema,
} from "../extractVideoRecipe";

/** The download and the transcription leave the process; what is tested is what the tool does with them. */
vi.mock("@convex/lib/socialVideo/httpsGet", () => ({ httpsDownloadVideo: vi.fn() }));
vi.mock("@convex/lib/openrouter/transcribe", () => ({ transcribe: vi.fn() }));

beforeEach(() => {
  vi.mocked(httpsDownloadVideo).mockReset();
  vi.mocked(transcribe).mockReset();
});

/**
 * The boundary right after the model call, as in `sanitizeRecipe.test.ts`: the schema forces every
 * recipe field to be filled, so a video that teaches no dish still comes back as a recipe-shaped
 * answer. `teachesRecipe` is the only thing that tells the two apart, and it is what must stop the
 * import before a made-up recipe is saved and served to every cook who shares that video.
 */
const _answer = (overrides: Record<string, unknown> = {}) => ({
  teachesRecipe: true,
  title: "Shakshuka",
  description: "Eggs poached in a spiced tomato and pepper sauce.",
  servings: 2,
  difficulty: 1,
  cuisine: "levantine",
  tags: [],
  equipments: [],
  timings: { preparation: 10, cooking: 20, resting: null },
  instructions: [{ title: null, steps: [{ instruction: "Soften the peppers", hints: [] }] }],
  ingredients: [{ name: "egg", quantity: 4, unit: "pcs" }],
  ...overrides,
});

describe("toVideoRecipe", () => {
  it("reads a video that teaches a dish as the recipe", () => {
    expect(toVideoRecipe(_answer())).toMatchObject({ title: "Shakshuka", timings: { preparation: 10, cooking: 20 } });
  });

  it("is NOT_A_RECIPE when the model says the video teaches no dish, whatever it filled in", () => {
    expect(codeOf(() => toVideoRecipe(_answer({ teachesRecipe: false })))).toBe("NOT_A_RECIPE");
  });

  it("is NOT_A_RECIPE when the verdict is missing, rather than saving a recipe nobody vouched for", () => {
    const { teachesRecipe: _dropped, ...answer } = _answer();

    expect(codeOf(() => toVideoRecipe(answer))).toBe("NOT_A_RECIPE");
  });

  /**
   * MiMo's real answer to a reel with no recipe (Instagram `Dd9oOCIJqso`, 2026-10-05): the verdict
   * is right, and the fields it was told to fill "minimally" break the recipe schema (timings of 0).
   * Validated by the AI SDK, that answer threw `AI_NoObjectGeneratedError` before the verdict was
   * read, and the cook was told the service was down.
   */
  const MIMO_NOT_A_RECIPE = {
    teachesRecipe: false,
    title: "",
    description: "",
    servings: 0,
    difficulty: 1,
    cuisine: "other",
    tags: [],
    equipments: [],
    timings: { preparation: 0, cooking: 0, resting: 0 },
    instructions: [],
    ingredients: [],
  };

  it("is NOT_A_RECIPE for that answer, though its fields break the recipe schema", () => {
    expect(codeOf(() => toVideoRecipe(MIMO_NOT_A_RECIPE))).toBe("NOT_A_RECIPE");
  });

  it("is handed to the AI SDK unvalidated, so that answer reaches the verdict at all", async () => {
    expect(videoRecipeOutputSchema.validate).toBeUndefined();
    expect(await videoRecipeOutputSchema.jsonSchema).toMatchObject({
      properties: { teachesRecipe: { type: "boolean" }, timings: expect.any(Object) },
    });
  });
});

const INSTAGRAM = { videoUrl: "https://scontent.cdninstagram.com/v/reel.mp4?oh=signed" };
const TIKTOK = { videoUrl: "https://v16-webapp.tiktok.com/video.mp4", videoHeaders: { Cookie: "tt_chain_token=abc" } };

describe("fetchVideo", () => {
  beforeEach(() => {
    vi.mocked(httpsDownloadVideo).mockResolvedValue({ bytes: Buffer.from("mp4 bytes"), mediaType: "video/mp4" });
  });

  it("downloads an Instagram reel for its transcript, and still hands the model its URL", async () => {
    const video = await fetchVideo(INSTAGRAM);

    expect(httpsDownloadVideo).toHaveBeenCalledWith(INSTAGRAM.videoUrl, {}, expect.any(Object));
    expect(video).toEqual({
      base64: Buffer.from("mp4 bytes").toString("base64"),
      mediaType: "video/mp4",
      part: { url: INSTAGRAM.videoUrl },
    });
  });

  it("downloads a TikTok with its cookies and hands the model the file, which its CDN keeps from anyone else", async () => {
    const video = await fetchVideo(TIKTOK);

    expect(httpsDownloadVideo).toHaveBeenCalledWith(TIKTOK.videoUrl, TIKTOK.videoHeaders, expect.any(Object));
    expect(video.part).toEqual({ base64: video.base64, mediaType: "video/mp4" });
  });
});

describe("transcriptOf", () => {
  const VIDEO = { base64: "bXA0", mediaType: "video/mp4", part: { url: INSTAGRAM.videoUrl } };

  it("is what the creator says", async () => {
    vi.mocked(transcribe).mockResolvedValue("Into the pan for twelve minutes.");

    expect(await transcriptOf(VIDEO)).toBe("Into the pan for twelve minutes.");
  });

  it("is null when the transcription fails, so the import goes on from the frames and the caption", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(transcribe).mockRejectedValue(new Error("Transcription answered 503"));

    expect(await transcriptOf(VIDEO)).toBeNull();
  });
});

describe("videoRecipeMessages", () => {
  const textsOf = (messages: ReturnType<typeof videoRecipeMessages>) =>
    messages[0]!.content.flatMap((part) => (part.type === "text" ? [part.text] : []));

  it("hands the model the transcript, marked as machine-made so a misheard word is read in context", () => {
    const transcript = "Into the pan for twelve minutes.";
    const texts = textsOf(videoRecipeMessages("Lentil dal #vegan", transcript, { url: INSTAGRAM.videoUrl }));

    expect(texts).toEqual([
      "The creator's caption, as posted:\nLentil dal #vegan",
      "What is said in the video, transcribed by machine:\nInto the pan for twelve minutes.",
    ]);
  });

  it("says so when nothing was transcribed, rather than leaving the model to guess why", () => {
    const texts = textsOf(videoRecipeMessages("Lentil dal", null, { url: INSTAGRAM.videoUrl }));

    expect(texts[1]).toBe("Nothing said in the video could be transcribed.");
  });
});
