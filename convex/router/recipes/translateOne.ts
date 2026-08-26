import { internal } from "@convex/_generated/api";
import { translateRecipe } from "@convex/agent/tools/translateRecipe";
import { loadForTranslation } from "@convex/functions/recipes/loadForTranslation";
import { saveTranslations } from "@convex/functions/recipes/saveTranslations";
import { internalAction, internalMutation, internalQuery } from "@convex/procedures";
import { vLocale } from "@convex/schema/i18n";
import { vTranslatedRecipe } from "@convex/schema/recipes";
import { v } from "convex/values";

/**
 * Fills in every language a recipe is still missing, in one model call.
 *
 * `sourceLocale` is an argument rather than something read off the document, because the document
 * cannot say it: `title.values` is a map, and the language a recipe was WRITTEN in is not
 * recoverable from the order of its keys. The caller that created the row knows it.
 *
 * The whole run is a no-op when nothing is missing — `translateRecipe` refuses an empty locale
 * list, and asking it for zero languages would be asking for an answer it cannot give.
 */
export const _internal = internalAction({
  args: { recipeId: v.id("recipes"), sourceLocale: vLocale },
  handler: async (ctx, args) => {
    const source = await ctx.runQuery(internal.router.recipes.translateOne._internal_load, args);
    if (!source.missingLocales.length) return;

    const translations = await translateRecipe.run(
      { ...ctx, userId: source.userId },
      { recipe: source.recipe, locales: source.missingLocales },
    );

    await ctx.runMutation(internal.router.recipes.translateOne._internal_persist, {
      recipeId: args.recipeId,
      sourceLocale: args.sourceLocale,
      translations,
    });
  },
});

export const _internal_load = internalQuery({
  args: { recipeId: v.id("recipes"), sourceLocale: vLocale },
  handler: (ctx, args) => loadForTranslation(ctx, args),
});

export const _internal_persist = internalMutation({
  args: {
    recipeId: v.id("recipes"),
    sourceLocale: vLocale,
    translations: v.array(vTranslatedRecipe),
  },
  handler: (ctx, args) => saveTranslations(ctx, args),
});
