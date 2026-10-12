import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { enforceRateLimit } from "@convex/functions/rateLimits/enforceRateLimit";
import { verifyAgainstSource } from "@convex/functions/recipes/verifyAgainstSource";
import { type AppUser, adminActionI18n, type TracedActionCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";
import { ConvexError, v } from "convex/values";

type Context = TracedActionCtx & { userId: Id<"users">; user: Pick<AppUser, "role">; i18n: { locale: Locale } };

const vOutcome = v.union(
  v.object({ verdict: v.literal("unchanged") }),
  v.object({ verdict: v.literal("rewritten"), corrections: v.array(v.string()) }),
);

type Outcome = typeof vOutcome.type;

/**
 * An admin's "Verify the recipe": the stored recipe checked by the verifier against its page, which
 * the tool scrapes again, and the row rewritten through the edit's own persist when it was wrong.
 *
 * `admin` and nothing else. It rewrites any recipe, a catalog one with no owner included, so there
 * is no ownership to check — the role is the whole gate, and `adminActionI18n` holds it.
 *
 * Rate limited like a cook's edit (`recipeWrite`), whose work it repeats — a model call and a
 * resolve of every line — plus a scrape. ADR 0018 does not exempt admins: they get
 * `ADMIN_MULTIPLIER` times the allowance, so a leaked admin session still has a ceiling.
 *
 * @limitation The check runs in the app's language, like `updateOne`, not in the recipe's own. A
 *   French recipe verified from an app in English is read and rewritten in English, and the French
 *   is then re-translated from it. Accepted: the recipe does not record the language it was written in.
 */
const handler = async (ctx: Context, { recipeId }: { recipeId: Id<"recipes"> }): Promise<Outcome> => {
  const locale = ctx.i18n.locale;

  const stored = await ctx.runQuery(internal.router.recipes.getOne._internal, { id: recipeId, locale });
  if (!stored.sourceUrl)
    throw new ConvexError({ code: "INVALID_INPUT" as const, message: "This recipe was not imported from a page" });

  // After the refusal that costs nothing, before the tool's scrape and model, which cost something.
  await enforceRateLimit(ctx, "recipeWrite");

  const verification = await verifyAgainstSource(ctx, { stored, url: stored.sourceUrl, locale });

  if (verification.verdict === "unchanged") return verification;

  const { corrections, recipe, links, complete } = verification;
  await ctx.runMutation(internal.router.recipes.updateOne._internal_persist, {
    recipeId,
    locale,
    analyzed: true,
    recipe,
    links,
    complete,
  });

  await ctx.scheduleTracedAfter(0, internal.router.recipes.translateOne._internal, {
    recipeId,
    sourceLocale: locale,
  });

  return { verdict: "rewritten", corrections };
};

export const admin = adminActionI18n({
  trace: "recipes/verifyOne",
  args: { recipeId: v.id("recipes") },
  returns: vOutcome,
  handler: (ctx, args): Promise<Outcome> => handler(ctx, args),
});
