import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { sanitizeRecipe } from "@convex/agent/tools/sanitizeRecipe";
import { saveRecipe } from "@convex/functions/recipes/saveRecipe";
import { type ActionCtx, authActionI18n, internalAction, internalMutation } from "@convex/procedures";
import { type Locale, vLocale } from "@convex/schema/i18n";
import { vSanitizedRecipe } from "@convex/schema/recipePayloads";
import { v } from "convex/values";

type Context = ActionCtx & { userId: Id<"users">; i18n: { locale: Locale } };

type Args = {
  title?: string;
  description?: string;
  servings: number;
  ingredients: string;
  instructions: string;
};

/**
 * Sanitizing is what the cook waits for; translating is not, so it is scheduled rather than
 * awaited — the recipe id comes back as soon as the row exists, in the one language they wrote it.
 */
const handler = async (ctx: Context, args: Args): Promise<Id<"recipes">> => {
  const locale = ctx.i18n.locale;

  const recipe = await sanitizeRecipe.run(ctx, {
    locale,
    title: args.title,
    description: args.description,
    servings: args.servings,
    ingredients: args.ingredients.split("\n").map((line) => line.trim()).filter(Boolean),
    instructions: args.instructions,
    outdated: null,
  });

  const recipeId = await ctx.runMutation(internal.router.recipes.createOne._internal_persist, {
    userId: ctx.userId,
    locale,
    recipe: {
      ...recipe,
      servings: args.servings,
    },
  });

  await ctx.scheduler.runAfter(0, internal.router.recipes.translateOne._internal, {
    recipeId,
    sourceLocale: locale,
  });

  return recipeId;
};

const sharedArgs = {
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  servings: v.number(),
  ingredients: v.string(),
  instructions: v.string(),
};

export const authed = authActionI18n({
  args: sharedArgs,
  handler: (ctx, args): Promise<Id<"recipes">> => handler(ctx, args),
});

export const _internal = internalAction({
  args: { ...sharedArgs, locale: vLocale, userId: v.id("users") },
  handler: (ctx, args): Promise<Id<"recipes">> =>
    handler({ ...ctx, i18n: { locale: args.locale }, userId: args.userId }, args),
});

export const _internal_persist = internalMutation({
  args: { userId: v.id("users"), locale: vLocale, recipe: vSanitizedRecipe },
  handler: (ctx, args): Promise<Id<"recipes">> => saveRecipe(ctx, args),
});
