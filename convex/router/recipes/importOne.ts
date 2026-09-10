import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { RecipeDraft } from "@convex/lib/scraping/toRecipeDraft";
import { type ActionCtx, authAction, internalAction } from "@convex/procedures";
import { vLocale } from "@convex/schema/i18n";
import { vRecipeDraft } from "@convex/schema/recipePayloads";
import { httpUrlOf } from "@shared/urls";
import { ConvexError, v } from "convex/values";

/**
 * A recipe page the cook found, as a filled-in editor.
 *
 * **The import extracts; it does not create.** `authed` hands back a DRAFT and stops there, and the
 * cook lands in `/recipe/new` with the fields already full. Save is the create path a typed recipe
 * has always taken, unchanged and unaware an import happened. Three things follow: no model call is
 * spent on a page that turns out to be unreadable, nothing is written until a human agreed to it,
 * and there is still exactly one way for a recipe to come into existence.
 *
 * `authed` rather than `anon` because it makes our servers fetch a URL the caller chose — a small
 * SSRF-shaped surface (`fetchPage` holds the guards) and a bandwidth cost, and both want a name
 * attached. It takes no document id, so ADR 0003's ownership question does not arise, which is the
 * same reasoning `router/ingredients/resolve.ts` writes out.
 *
 * `authAction` rather than `authActionI18n`: extraction has no locale in it. The draft comes back
 * in whatever language the page was written in, and the locale is applied by `createOne` at Save,
 * where it already is — so a French cook importing an English page gets a French recipe with
 * nothing built for it.
 */
const _extract = async (ctx: ActionCtx, url: string): Promise<RecipeDraft> => {
  /**
   * Validated here as well as on the screen, because a client is not a gate: this export is
   * callable without it. `INVALID_INPUT` before any fetch is also the only refusal that costs
   * nothing, which is what makes it worth stating twice.
   */
  const target = httpUrlOf(url);
  if (!target) {
    throw new ConvexError({ code: "INVALID_INPUT" as const, message: "Not a web address" });
  }

  return await ctx.runAction(internal.router.recipes.importOneNode._internal, { url: target });
};

export const authed = authAction({
  args: { url: v.string() },
  returns: vRecipeDraft,
  handler: (ctx, { url }): Promise<RecipeDraft> => _extract(ctx, url),
});

/**
 * The dashboard path, and the reason the two exports return different things.
 *
 * Importing from the Convex dashboard has no screen and no human to press Save, so this one runs
 * the whole ring itself: extract, then `createOne._internal`. `authed` above returns a draft; this
 * returns the id of a row that now exists. That asymmetry is the point rather than an oversight —
 * it is what keeps the app path stopping at a draft a cook can correct.
 */
export const _internal = internalAction({
  args: { url: v.string(), userId: v.id("users"), locale: vLocale },
  returns: v.id("recipes"),
  handler: async (ctx, { url, userId, locale }): Promise<Id<"recipes">> => {
    const draft = await _extract(ctx, url);

    return await ctx.runAction(internal.router.recipes.createOne._internal, {
      ...draft,
      userId,
      locale,
    });
  },
});
