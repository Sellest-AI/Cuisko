"use node";
import { generateRecipeFromVideo } from "@convex/functions/recipes/generateRecipeFromVideo";
import { fetchSocialVideo } from "@convex/lib/socialVideo/fetchSocialVideo";
import { resolveShortLink } from "@convex/lib/socialVideo/resolveShortLink";
import { socialVideoSourceOf } from "@convex/lib/socialVideo/sources";
import { internalAction } from "@convex/procedures";
import { vLocale } from "@convex/schema/i18n";
import { vRecipeLink, vSanitizedRecipe } from "@convex/schema/recipePayloads";
import { ConvexError, v } from "convex/values";

/**
 * The half of a video import that needs the Node runtime: the post page, and a short link's
 * redirect, are read through `node:https` (`lib/socialVideo/httpsGet.ts`), which the default
 * runtime does not have.
 *
 * It returns the generated recipe and stops: the insert and the scheduling stay in `importVideo`,
 * through `createGeneratedRecipe`, the one way a generated recipe comes into existence. What
 * crosses back is the recipe, a few kilobytes. Every video is downloaded inside the tool for its
 * transcript (`tools/extractVideoRecipe.ts`), a TikTok with the page's cookies, and none crosses a
 * boundary.
 *
 * `url` is re-read rather than trusted: this action is internal, but the adapter is the one that
 * knows the platform's page, and the canonical spelling is all it needs.
 *
 * @costly
 */
export const _internal = internalAction({
  args: { url: v.string(), locale: vLocale, userId: v.id("users") },
  returns: v.object({ recipe: vSanitizedRecipe, links: v.array(vRecipeLink) }),
  handler: async (ctx, { url, locale, userId }) => {
    const source = socialVideoSourceOf(url);
    if (!source) throw new ConvexError({ code: "INVALID_INPUT" as const, message: "Not a video link we can import" });

    const { caption, videoUrl, videoHeaders } = await fetchSocialVideo(source);

    return await generateRecipeFromVideo({ ...ctx, userId }, { locale, caption, videoUrl, videoHeaders });
  },
});

/**
 * A short link's canonical address (`resolveShortLink`), so `importVideo` can look for a recipe
 * already imported from that video before it charges `recipeVideoImport`. No model, but a Node
 * action and a request to the platform per call, which is why it is `@costly` and held to
 * `videoLinkResolve` by its caller.
 *
 * @costly
 */
export const _internal_resolveShortLink = internalAction({
  args: { url: v.string() },
  returns: v.string(),
  handler: async (_ctx, { url }) => (await resolveShortLink(url)).canonicalUrl,
});
