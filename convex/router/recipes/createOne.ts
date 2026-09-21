import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { generateRecipe } from "@convex/functions/recipes/generateRecipe";
import { replaceRecipeImages } from "@convex/functions/recipes/recipeImages";
import { saveRecipe } from "@convex/functions/recipes/saveRecipe";
import { type ActionCtx, authActionI18n, internalAction, internalMutation } from "@convex/procedures";
import { type Locale, vLocale } from "@convex/schema/i18n";
import { vRecipeLink, vSanitizedRecipe } from "@convex/schema/recipePayloads";
import { type ObjectType, v } from "convex/values";

type Context = ActionCtx & { userId?: Id<"users">; i18n: { locale: Locale } };

type Args = ObjectType<typeof sharedArgs>;

/**
 * Generating is what the cook waits for; translating is not, so it is scheduled rather than
 * awaited — the recipe id comes back as soon as the row exists, in the language they wrote it.
 *
 * Resolving the ingredients is inside that wait, and the seconds it adds are taken knowingly: a
 * recipe briefly and invisibly wrong about what it contains is worse than one that takes longer to
 * appear, since the detail screen, the tags and the nutrition totals all read those links the
 * moment the route changes. The cost falls over time on its own — every row the resolver invents
 * and every alias it remembers is one the next import finds for free.
 */
const handler = async (ctx: Context, { sourceUrl, ...text }: Args): Promise<Id<"recipes">> => {
  const locale = ctx.i18n.locale;

  const { recipe, links } = await generateRecipe(ctx, { ...text, locale });

  const recipeId = await ctx.runMutation(internal.router.recipes.createOne._internal_persist, {
    userId: ctx.userId,
    locale,
    recipe,
    links,
    sourceUrl,
  });

  await ctx.scheduler.runAfter(0, internal.router.recipes.translateOne._internal, {
    recipeId,
    sourceLocale: locale,
  });

  await ctx.scheduler.runAfter(0, internal.router.recipes.generateImages._internal, {
    recipeId,
    userId: ctx.userId
  })

  return recipeId;
};

const sharedArgs = {
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  servings: v.number(),
  ingredients: v.string(),
  instructions: v.string(),
  sourceUrl: v.optional(v.string()),
};

export const authed = authActionI18n({
  args: sharedArgs,
  handler: (ctx, args): Promise<Id<"recipes">> => handler(ctx, args),
});

export const _internal = internalAction({
  args: { ...sharedArgs, locale: vLocale },
  handler: (ctx, args): Promise<Id<"recipes">> =>
    handler({ ...ctx, i18n: { locale: args.locale } }, args),
});

export const _internal_persist = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    locale: vLocale,
    recipe: vSanitizedRecipe,
    links: v.array(vRecipeLink),
    sourceUrl: v.optional(v.string()),
  },
  handler: (ctx, args): Promise<Id<"recipes">> => saveRecipe(ctx, args),
});

export const _internal_persistImages = internalMutation({
  args: {
    recipeId: v.id("recipes"),
    coverImageId: v.optional(v.id("images")),
    plateImageId: v.optional(v.id("images")),
  },
  handler: (ctx, args): Promise<void> => replaceRecipeImages(ctx, args),
});
