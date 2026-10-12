"use node";
import type { Id } from "@convex/_generated/dataModel";
import { extractVideoRecipe } from "@convex/agent/tools/extractVideoRecipe";
import type { SanitizedRecipe } from "@convex/agent/tools/sanitizeRecipe";
import type { TracedActionCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";

import { resolveRecipeIngredients, type RecipeLink } from "./resolveRecipeIngredients";

type Args = {
  locale: Locale;
  caption: string;
  /** The signed CDN address of the video, never the video. */
  videoUrl: string;
  /** What its CDN demands, when the model cannot fetch it alone (see `SocialVideo.videoHeaders`). */
  videoHeaders?: Record<string, string>;
};

/**
 * A recipe video turned into everything the insert needs: the recipe in one language, and the
 * catalog row each of its lines belongs to. `generateRecipe`'s twin for a video, and the reason
 * `createGeneratedRecipe` cannot tell the two apart.
 *
 * Unlike `generateRecipe`, no servings are imposed afterwards: a typed recipe's count was stated on
 * a form, a video's is whatever the model heard, read or estimated.
 *
 * Node runtime only, through the tool, which may download the video (`extractVideoRecipe`).
 */
export const generateRecipeFromVideo = async (
  ctx: TracedActionCtx & { userId?: Id<"users"> },
  { locale, caption, videoUrl, videoHeaders }: Args,
): Promise<{ recipe: SanitizedRecipe; links: RecipeLink[] }> => {
  const recipe = await extractVideoRecipe.run(ctx, { locale, caption, videoUrl, videoHeaders });

  // `complete` is discarded for the same reason `generateRecipe` gives: a create has no links to lose.
  const { links } = await resolveRecipeIngredients(ctx, { recipe, locale });

  return { recipe, links };
};
