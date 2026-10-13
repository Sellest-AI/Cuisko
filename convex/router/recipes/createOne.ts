import type { Id } from "@convex/_generated/dataModel";
import { withRateLimit } from "@convex/functions/rateLimits/enforceRateLimit";
import { createGeneratedRecipe } from "@convex/functions/recipes/createGeneratedRecipe";
import { generateRecipe } from "@convex/functions/recipes/generateRecipe";
import { replaceRecipeImages } from "@convex/functions/recipes/recipeImages";
import { saveRecipe } from "@convex/functions/recipes/saveRecipe";
import { captureEvent } from "@convex/lib/posthog/captureEvent";
import { isSocialVideoLink } from "@convex/lib/socialVideo/sources";
import { authActionI18n, internalAction, internalMutation, type TracedActionCtx } from "@convex/procedures";
import type { CapturedEvent } from "@convex/schema/events";
import { type Locale, vLocale } from "@convex/schema/i18n";
import { vRecipeLink, vSanitizedRecipe } from "@convex/schema/recipePayloads";
import { type ObjectType, v } from "convex/values";

type Context = TracedActionCtx & { userId?: Id<"users">; i18n: { locale: Locale } };

type Args = ObjectType<typeof sharedArgs>;

/** The new recipe, and how many ingredient lines the model read into it, which only its event needs. */
type Created = { recipeId: Id<"recipes">; ingredients: number };

/**
 * Generating is what the cook waits for; translating is not, so it is scheduled rather than
 * awaited — the recipe id comes back as soon as the row exists, in the language they wrote it
 * (`createGeneratedRecipe`).
 *
 * @limitation Design choice: resolving the ingredients is inside that wait, so creating is slower.
 * A recipe briefly and invisibly wrong about what it contains is worse than one that takes longer
 * to appear, since the detail screen, the tags and the nutrition totals all read those links the
 * moment the route changes. The cost falls over time on its own — every row the resolver invents
 * and every alias it remembers is one the next import finds for free.
 */
const handler = async (ctx: Context, { sourceUrl, ...text }: Args): Promise<Created> => {
  const locale = ctx.i18n.locale;

  const { recipe, links } = await generateRecipe(ctx, { ...text, locale });

  // A video's address is only ever written by `importVideo`, whose dedupe serves it to every cook.
  const storedSourceUrl = sourceUrl && !isSocialVideoLink(sourceUrl) ? sourceUrl : undefined;

  const recipeId = await createGeneratedRecipe(ctx, { userId: ctx.userId, locale, recipe, links, sourceUrl: storedSourceUrl });
  return { recipeId, ingredients: recipe.ingredients.length };
};

/**
 * The event for a cook's new recipe (ADR 0019): `recipe created` when they typed it, `recipe
 * imported` with its source when it came from a page or a video. Read from the address the cook
 * sent, since the stored one drops a video's. Both carry the recipe's id, which every plate event
 * names too, and its number of ingredient lines, so an import that came back nearly empty shows in
 * PostHog rather than passing for a success.
 */
const _createdEvent = (
  userId: Id<"users">,
  sourceUrl: string | undefined,
  { recipeId, ingredients }: Created,
): CapturedEvent<"recipe created" | "recipe imported"> =>
  sourceUrl === undefined
    ? { event: "recipe created", distinctId: userId, properties: { recipeId, ingredients } }
    : {
        event: "recipe imported",
        distinctId: userId,
        properties: { recipeId, source: isSocialVideoLink(sourceUrl) ? "video" : "link", ingredients },
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
  trace: "recipes/createOne",
  args: sharedArgs,
  handler: (ctx, args): Promise<Id<"recipes">> =>
    withRateLimit(ctx, "recipeWrite", async () => {
      const created = await handler(ctx, args);
      await captureEvent(ctx, _createdEvent(ctx.userId, args.sourceUrl, created));
      return created.recipeId;
    }),
});

/** @costly */
export const _internal = internalAction({
  args: { ...sharedArgs, locale: vLocale },
  handler: async (ctx, args): Promise<Id<"recipes">> =>
    (await handler({ ...ctx, i18n: { locale: args.locale } }, args)).recipeId,
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
