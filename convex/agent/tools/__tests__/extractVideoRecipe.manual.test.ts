/**
 * One real video import: does `models.videoRecipes` turn a reel into a recipe our schema accepts?
 *
 * ⚠️ THIS COSTS MONEY AND HALF A MINUTE: under 1 cent of OpenRouter (the transcript and the recipe) and a live
 * download of the post.
 * Run it by hand:
 *
 *     pnpm test:manual -- extractVideoRecipe
 *
 * Another video (a TikTok, whose CDN wants the page's cookies, so the model gets the file inline):
 *
 *     VIDEO=https://www.tiktok.com/@iramsfoodstory/video/7690673524758924557 pnpm test:manual -- extractVideoRecipe
 *
 * To send the same reel to the model inline instead of as its URL, which shows whether the provider OpenRouter picks accepts the video that way:
 *
 *     SEND=inline pnpm test:manual -- extractVideoRecipe
 *
 * It needs the real `OPENROUTER_API_KEY` in `.env.local`. Nothing automatic runs it: `*.manual.test.ts`
 * belongs to the `manual` project alone.
 *
 * Not a bake-off: there is one candidate, and the question is whether the pipe holds end to end
 * (page; download; transcript; the video as a URL the model fetches itself, or inline for TikTok;
 * structured output; `toVideoRecipe`). What runs is the tool's real pieces, imported rather than
 * copied: `fetchSocialVideo`, `fetchVideo`, `transcriptOf`, the prompt, `videoRecipeMessages`, `videoRecipeOutputSchema`,
 * `toVideoRecipe` and the model entry. A video that teaches no dish fails here with `NOT_A_RECIPE`.
 * What is not shared is `wrapAgent`, as in every bake-off here: a Convex `ToolCtx` is not part of
 * the question.
 *
 * The recipe is printed whole, so you can read it against the video. The reel says "18 minutes" in
 * the air fryer where its caption writes 20: the transcript is printed first, and which number the
 * recipe carries is the first thing to look at.
 */
import { generateText, Output } from "ai";
import { describe, expect, it } from "vitest";

import { fetchSocialVideo } from "../../../lib/socialVideo/fetchSocialVideo";
import { socialVideoSourceOf } from "../../../lib/socialVideo/sources";
import { reportedCost } from "../../__bench__/provider";
import { models } from "../../config/models";
import { extractVideoRecipePrompt } from "../../config/prompts/extractVideoRecipe";
import {
  fetchVideo,
  toVideoRecipe,
  transcriptOf,
  videoRecipeMessages,
  videoRecipeOutputSchema,
} from "../extractVideoRecipe";

/**
 * Set `VIDEO` to try another one. The default is a French reel read into English on purpose: the recipe's language is
 * the cook's, never the creator's.
 */
const VIDEO = process.env.VIDEO ?? "https://www.instagram.com/p/DXhhOS8jqnJ/";
const LOCALE = "en" as const;
/** The agent's own effort (`videoRecipesAgent`), so the run measures what ships. */
const EFFORT = "high" as const;

/** `SEND=inline` hands the model the downloaded file even when it could fetch the URL itself. */
const SEND_INLINE = process.env.SEND === "inline";

describe("extractVideoRecipe, live", () => {
  it("turns a real reel into a recipe the schema accepts", async () => {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key || key.startsWith("test-")) {
      throw new Error("This test needs a real OPENROUTER_API_KEY in .env.local (gitignored).");
    }

    const source = socialVideoSourceOf(VIDEO);
    if (!source) throw new Error(`${VIDEO} is not a link any adapter claims`);

    const post = await fetchSocialVideo(source);
    const fetched = await fetchVideo(post);
    const video = SEND_INLINE ? { base64: fetched.base64, mediaType: fetched.mediaType } : fetched.part;
    const sent = "url" in video ? `as its URL (${new URL(video.url).host})` : `inline, ${(video.base64.length / 1e6).toFixed(1)} MB of base64`;
    console.log(`${source.platform} · caption ${post.caption.length} chars · video sent ${sent}`);

    const transcribing = Date.now();
    const transcript = await transcriptOf(fetched);
    console.log(`
transcript in ${((Date.now() - transcribing) / 1000).toFixed(0)} s:
${transcript ?? "(none)"}`);

    const started = Date.now();
    const result = await generateText({
      model: models.videoRecipes.model,
      providerOptions: models.videoRecipes.providerOptions({ effort: EFFORT }),
      system: extractVideoRecipePrompt(LOCALE),
      messages: videoRecipeMessages(post.caption, transcript, video),
      output: Output.object({ schema: videoRecipeOutputSchema }),
    });
    const seconds = ((Date.now() - started) / 1000).toFixed(0);

    const recipe = toVideoRecipe(result.output);
    const cost = reportedCost(result.finalStep.providerMetadata);
    // The provider that answered: GLM is routed by price, so a run says nothing about the others.
    const provider = (result.finalStep.providerMetadata?.openrouter as { provider?: string } | undefined)?.provider;

    console.log(`\n${provider ?? "?"} · ${seconds} s · $${cost?.toFixed(4) ?? "?"} · ${result.usage.totalTokens ?? "?"} tokens\n`);
    console.log(JSON.stringify(recipe, null, 2));

    expect(recipe.ingredients.length).toBeGreaterThan(3);
    expect(recipe.instructions.flatMap(({ steps }) => steps).length).toBeGreaterThan(2);
  });
});
