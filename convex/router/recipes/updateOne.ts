import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { assertFilledIn, assertTimingsInRange, type RecipeEdit } from "@convex/functions/recipes/recipeChangesOf";
import { regenerateRecipe } from "@convex/functions/recipes/regenerateRecipe";
import { updateRecipe } from "@convex/functions/recipes/updateRecipe";
import { type ActionCtx, type AppUser, authActionI18n, internalMutation } from "@convex/procedures";
import { type Locale, vLocale } from "@convex/schema/i18n";
import { vRecipeEdit, vRecipeLink, vSanitizedRecipe } from "@convex/schema/recipePayloads";
import { ConvexError, v } from "convex/values";

type Context = ActionCtx & { userId: Id<"users">; user: Pick<AppUser, "role">; i18n: { locale: Locale } };

type Args = RecipeEdit & { recipeId: Id<"recipes"> };

/**
 * Rewriting a recipe already in the table, from the cook's edited free text.
 *
 * Mirrors `createOne` in one respect and departs from it in another. `outdated` is the same idea:
 * the model revises the row it is handed rather than generating one from nothing. But an edit that
 * did not touch the ingredients has nothing for the agent to re-derive, so `recipeChangesOf`
 * decides whether to spend a model call at all. Difficulty, cuisine, timings, equipment and authored
 * tags are guessed on the first save and the cook's from then on — a rerun never overwrites them.
 *
 * `updateRecipe` learns which branch ran through `analyzed`, because a field the model never saw is
 * the cook's own words, not a machine's.
 *
 * ⚠️ The ownership check below is hand-written, and ADR 0003 §"Actions" is why it is allowed to be.
 *    An action has `runQuery`, not `db`, so no `ownedAction` builder can exist to make it
 *    unforgettable the way `ownedMutation` does for a mutation — `procedures.ts` cannot reach
 *    `internal.*` to run the check itself without the import cycle ADR 0001 bans. Nothing detects
 *    its absence, so deleting these two lines silently turns this into an IDOR: any signed-in cook
 *    could rewrite any recipe by id. The rejection test in `__tests__/updateOne.test.ts` is the
 *    only thing standing under it.
 */
const handler = async (ctx: Context, args: Args): Promise<Id<"recipes">> => {
  const locale = ctx.i18n.locale;
  assertFilledIn(args);
  assertTimingsInRange(args);

  const stored = await ctx.runQuery(internal.router.recipes.getOne._internal, { id: args.recipeId, locale });
  if (stored.userId !== ctx.userId) throw new ConvexError({ code: "FORBIDDEN" });

  const { recipe, links, complete, analyzed, requiresTranslation } = await regenerateRecipe(ctx, {
    edit: args,
    stored,
    locale,
  });

  await ctx.runMutation(internal.router.recipes.updateOne._internal_persist, {
    recipeId: args.recipeId,
    locale,
    analyzed,
    recipe,
    links,
    complete,
  });

  if (requiresTranslation || analyzed)
    await ctx.scheduler.runAfter(0, internal.router.recipes.translateOne._internal, {
      recipeId: args.recipeId,
      sourceLocale: locale,
    });

  return args.recipeId;
};

export const authed = authActionI18n({
  args: { ...vRecipeEdit, recipeId: v.id("recipes") },
  handler: (ctx, args): Promise<Id<"recipes">> => handler(ctx, args),
});

export const _internal_persist = internalMutation({
  args: { recipeId: v.id("recipes"), locale: vLocale, recipe: vSanitizedRecipe, analyzed: v.boolean(), links: v.array(vRecipeLink), complete: v.boolean() },
  handler: (ctx, args): Promise<Id<"recipes">> => updateRecipe(ctx, args),
});
