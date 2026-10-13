import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { type RateLimitCtx, withRateLimit } from "@convex/functions/rateLimits/enforceRateLimit";
import { createGeneratedRecipe } from "@convex/functions/recipes/createGeneratedRecipe";
import { findBySource } from "@convex/functions/recipes/findBySource";
import { captureEvent } from "@convex/lib/posthog/captureEvent";
import { socialShortLinkOf, socialVideoSourceOf } from "@convex/lib/socialVideo/sources";
import { type TracedActionCtx, authActionI18n, internalQuery } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";
import { ConvexError, v } from "convex/values";

type Context = TracedActionCtx & RateLimitCtx & { i18n: { locale: Locale } };

/** The recipe the share ended on, and whether it is the caller's own (never who else owns it, ADR 0014). */
type Imported = { recipeId: Id<"recipes">; isOwned: boolean };

/**
 * The one address the recipe is saved under, which is what makes a second share find the first
 * import. A short link (the TikTok app's share) names no video until its redirect is followed, so
 * it costs a Node action and a request, held to `videoLinkResolve`; every other link is read here
 * for free.
 */
const _canonicalUrlOf = async (ctx: Context, url: string): Promise<string> => {
  const canonicalUrl = socialVideoSourceOf(url)?.canonicalUrl;
  if (canonicalUrl) return canonicalUrl;

  if (!socialShortLinkOf(url)) {
    throw new ConvexError({ code: "INVALID_INPUT" as const, message: "Not a video link we can import" });
  }
  return await withRateLimit(ctx, "videoLinkResolve", () =>
    ctx.runTracedAction(internal.router.recipes.importVideoNode._internal_resolveShortLink, { url }),
  );
};

/**
 * A recipe video a cook shared (an Instagram reel, a TikTok), as a recipe they can open.
 *
 * **It creates, unlike `importOne`, which stops at a draft.** The cook shared from another app and
 * is waiting on the share sheet, not standing in an editor, so the call returns a recipe that
 * exists: one it created, `status: "generated"` like any `createOne` recipe and theirs to correct
 * (`isOwned: true`), or one already imported from the same video (below). Translations and
 * images follow in the background, exactly as for a typed recipe (`createGeneratedRecipe`).
 *
 * One call, and the cook waits up to 3 minutes on it: no status row to poll. If the connection
 * drops, the work still finishes, and the same share again returns that recipe for free
 * (`findBySource`).
 *
 * **A video anyone already imported is not imported again.** The share answers with that recipe,
 * and `isOwned` says whether it is the caller's; when it is another cook's, the app favorites it so
 * it is on this cook's shelf. `isOwned` rather than the owner's id, as `getOne` ships it: the app
 * needs "is it mine", never whose it is.
 *
 * The order is what each step costs: a link no platform claims is refused before anything runs, a
 * video already imported is answered before the rate limit is charged, and only a real import
 * takes one of the day's `recipeVideoImport` tokens.
 *
 * Reports `recipe imported` (ADR 0019) once the recipe exists, with its id and ingredient count,
 * and only for a real import: a video already imported is answered with that recipe, and nothing
 * new was made.
 *
 * @limitation A video that teaches no dish (`NOT_A_RECIPE`) is not remembered: each share of it
 * pays the model again and spends one of the cook's daily tokens. Remembering it needs a table of
 * refused addresses, not worth it until a popular non-recipe video is shared often.
 */
const _import = async (ctx: Context, url: string): Promise<Imported> => {
  const sourceUrl = await _canonicalUrlOf(ctx, url);
  const existing = await ctx.runQuery(internal.router.recipes.importVideo._internal_find, { sourceUrl });
  if (existing) return { recipeId: existing.recipeId, isOwned: existing.userId === ctx.userId };

  return await withRateLimit(ctx, "recipeVideoImport", async () => {
    const locale = ctx.i18n.locale;
    const { recipe, links } = await ctx.runTracedAction(internal.router.recipes.importVideoNode._internal, {
      url: sourceUrl,
      locale,
      userId: ctx.userId,
    });

    const recipeId = await createGeneratedRecipe(ctx, { userId: ctx.userId, locale, recipe, links, sourceUrl });
    await captureEvent(ctx, {
      event: "recipe imported",
      distinctId: ctx.userId,
      properties: { recipeId, source: "video", ingredients: recipe.ingredients.length },
    });
    return { recipeId, isOwned: true };
  });
};

export const authed = authActionI18n({
  trace: "recipes/importVideo",
  args: { url: v.string() },
  returns: v.object({ recipeId: v.id("recipes"), isOwned: v.boolean() }),
  handler: (ctx, { url }): Promise<Imported> => _import(ctx, url),
});

export const _internal_find = internalQuery({
  args: { sourceUrl: v.string() },
  returns: v.union(v.object({ recipeId: v.id("recipes"), userId: v.optional(v.id("users")) }), v.null()),
  handler: (ctx, args) => findBySource(ctx, args),
});
