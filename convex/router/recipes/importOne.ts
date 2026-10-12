import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { withRateLimit } from "@convex/functions/rateLimits/enforceRateLimit";
import { findCatalogBySource } from "@convex/functions/recipes/findCatalogBySource";
import type { RecipeDraft } from "@convex/lib/scraping/toRecipeDraft";
import { type TracedActionCtx, authAction, internalAction, internalQuery } from "@convex/procedures";
import { vLocale } from "@convex/schema/i18n";
import { vRecipeDraft } from "@convex/schema/recipePayloads";
import { canonicalUrlOf } from "@shared/urls";
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
const _extract = async (ctx: TracedActionCtx, url: string): Promise<RecipeDraft> => {
  /**
   * Validated here as well as on the screen, because a client is not a gate: this export is
   * callable without it. `INVALID_INPUT` before any fetch is also the only refusal that costs
   * nothing, which is what makes it worth stating twice.
   *
   * Canonicalized in the same breath: the trackers a share button appended are not part of the
   * page, so the fetch is made without them and the draft records the spelling every later write
   * will match against. The mapper stays URL-blind; this boundary is where the address is owned.
   */
  const target = canonicalUrlOf(url);
  if (!target) {
    throw new ConvexError({ code: "INVALID_INPUT" as const, message: "Not a web address" });
  }

  const draft = await ctx.runTracedAction(internal.router.recipes.importOneNode._internal, { url: target });

  return { ...draft, sourceUrl: target };
};

export const authed = authAction({
  trace: "recipes/importOne",
  args: { url: v.string() },
  returns: vRecipeDraft,
  handler: (ctx, { url }): Promise<RecipeDraft> => withRateLimit(ctx, "recipeImport", () => _extract(ctx, url)),
});

/**
 * The dashboard path, and the reason the two exports return different things.
 *
 * Importing from the Convex dashboard has no screen and no human to press Save, so this one runs
 * the whole ring itself: extract, then `createOne._internal`. `authed` above returns a draft; this
 * returns the id of a row that now exists. That asymmetry is the point rather than an oversight —
 * it is what keeps the app path stopping at a draft a cook can correct.
 *
 * A page the catalog holds returns its id before any fetch: `seed:catalog`'s ledger can be lost.
 */
export const _internal = internalAction({
  args: { url: v.string(), locale: vLocale },
  returns: v.id("recipes"),
  handler: async (ctx, { url, locale }): Promise<Id<"recipes">> => {
    const existing = await ctx.runQuery(internal.router.recipes.importOne._internal_find, { url });
    if (existing) return existing;

    const draft = await _extract(ctx, url);

    return await ctx.runTracedAction(internal.router.recipes.createOne._internal, {
      ...draft,
      locale,
    });
  },
});

export const _internal_find = internalQuery({
  args: { url: v.string() },
  returns: v.union(v.id("recipes"), v.null()),
  handler: (ctx, args) => findCatalogBySource(ctx, args),
});
