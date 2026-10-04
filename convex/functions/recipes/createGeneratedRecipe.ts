import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { SanitizedRecipe } from "@convex/agent/tools/sanitizeRecipe";
import type { ActionCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";

import type { RecipeLink } from "./resolveRecipeIngredients";

type Args = {
  userId?: Id<"users">;
  locale: Locale;
  recipe: SanitizedRecipe;
  links: RecipeLink[];
  sourceUrl?: string;
};

/**
 * A generated recipe written down, then completed in the background: the one way a recipe the
 * model wrote comes into existence, whether the cook typed it (`createOne`) or shared a video
 * (`importVideo`).
 *
 * Translating and illustrating are scheduled rather than awaited, because they are not what the
 * cook waits for: the id comes back as soon as the row exists, in the language they wrote it, and
 * the other languages and the photos arrive on the screen they are already looking at.
 */
export const createGeneratedRecipe = async (
  ctx: ActionCtx,
  { userId, locale, recipe, links, sourceUrl }: Args,
): Promise<Id<"recipes">> => {
  const recipeId = await ctx.runMutation(internal.router.recipes.createOne._internal_persist, {
    userId,
    locale,
    recipe,
    links,
    sourceUrl,
  });

  await ctx.scheduler.runAfter(0, internal.router.recipes.translateOne._internal, {
    recipeId,
    sourceLocale: locale,
  });

  await ctx.scheduler.runAfter(0, internal.router.recipes.generateImages._internal, { recipeId, userId });

  return recipeId;
};
