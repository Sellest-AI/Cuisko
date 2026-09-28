import type { Doc, Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import { LOCALES } from "@convex/schema/i18n";
import { AUTHORED_TAGS, type AuthoredTag, type Tag } from "@shared/tags";

import { deriveRecipeFields } from "./deriveRecipeFields";
import { mergeDuplicateLinks } from "./mergeDuplicateLinks";
import { recipeSearchText } from "./recipeSearchText";
import type { RecipeLink } from "./resolveRecipeIngredients";
import { syncRecipeLinks } from "./syncRecipeLinks";

const _isAuthored = (tag: Tag): tag is AuthoredTag => (AUTHORED_TAGS as readonly Tag[]).includes(tag);

/**
 * Whether the stored lines are every line the recipe had.
 *
 * `position` is the line's index in the recipe as it was written, and a line the resolver refused
 * at import is never stored — so it leaves a hole in the numbering, and the hole is the only trace
 * of it anywhere. Two other things remove a line, and neither leaves a hole: an edit renumbers
 * every line from its own text, and a merge (`mergeRecipeLines`) shifts the lines above the one it
 * folded away, keeping the merged line at its group's last position so a refused line's hole
 * always has a stored line above it.
 *
 * @limitation A refused LAST line leaves no hole, and a recipe missing only that line reads as
 * whole. Closing it means storing the recipe's line count, which no writer does yet.
 */
const _isWhole = (lines: Pick<Doc<"recipeIngredients">, "position">[]): boolean => {
  const positions = new Set(lines.map((line) => line.position));

  return lines.length > 0 && positions.size === lines.length && Math.max(...positions) === lines.length - 1;
};

/**
 * The stored lines with every food linked twice folded into one, rewritten when that changed them.
 *
 * Here because the refresh is what brings a stored recipe up to date: `migrations:runRefreshRecipes`
 * cleans every recipe saved before merging existed, and `replaceInRecipes`, which can itself move a
 * line onto a row the recipe already holds, merges through the refresh it already runs.
 *
 * Done before the wholeness check, and on a recipe missing a line too: the merge keeps a refused
 * line's hole (`mergeRecipeLines`), and a duplicate is a duplicate whether or not the tags can be
 * recomputed. It is reported as `merged`, apart from `refreshed`, which is about the tags and
 * `search`.
 */
const _mergeStored = async (
  ctx: MutationCtx,
  recipeId: Id<"recipes">,
  stored: Doc<"recipeIngredients">[],
): Promise<{ links: RecipeLink[]; merged: boolean }> => {
  const links = stored.map(({ ingredientId, position, quantity, unit }) => ({ ingredientId, position, quantity, unit }));
  const merged = await mergeDuplicateLinks(ctx, { links });

  if (merged.links.length === stored.length) return { links, merged: false };

  await syncRecipeLinks(ctx, { recipeId, rows: stored, links: merged.links });

  return { links: merged.links, merged: true };
};

const _sameTags = (a: readonly Tag[], b: readonly Tag[]) =>
  a.length === b.length && a.every((tag, index) => tag === b[index]);

/**
 * Rewrites what a recipe stores that is derived from its lines — the calculated tags, the six
 * facets and `search` — from its lines and the catalog as they are now. Nutrition is not stored,
 * so it has nothing to refresh.
 *
 * The tags somebody chose (`main`, `comfort-food`…) are kept, and only the calculated ones are
 * replaced: stored `tags` holds both kinds, and they are told apart by vocabulary.
 *
 * **A recipe missing a line is left exactly as it is**, tags AND search. Its tags would be refused
 * anyway (`computeTags` claims nothing from a subset), and its `search` is the only place the
 * dropped line's words survive — Katsudon's "tonkatsu" — which a rebuild from the stored lines
 * would erase.
 *
 * Writes only when something changed, so running it twice in a row writes nothing the second time.
 * Returns whether it rewrote the derived fields (`refreshed`), whether it folded duplicate lines
 * (`merged`), and whether the recipe was whole — `refreshed: false` alone cannot tell "already
 * current" from "skipped for a missing line", and a caller reporting to a person must.
 */
export const refreshRecipe = async (
  ctx: MutationCtx,
  recipeId: Id<"recipes">,
): Promise<{ refreshed: boolean; merged: boolean; whole: boolean }> => {
  const recipe = await ctx.db.get(recipeId);
  if (!recipe) throw new Error(`refreshRecipe: recipe ${recipeId} does not exist.`);

  const stored = await ctx.db
    .query("recipeIngredients")
    .withIndex("by_recipe", (q) => q.eq("recipeId", recipeId))
    .collect();

  const { links, merged } = await _mergeStored(ctx, recipeId, stored);

  if (!_isWhole(links)) return { refreshed: false, merged, whole: false };

  const { tags, facets } = await deriveRecipeFields(ctx, {
    tags: recipe.tags.filter(_isAuthored),
    servings: recipe.servings,
    links,
    lineCount: links.length,
  });

  // ADR 0011: the serializer is called HERE, where `search` is assigned. No names: the model's
  // spelling of each line was never stored, and each linked row's own blob carries its words.
  const search = await recipeSearchText(ctx, { ingredientIds: links.map((link) => link.ingredientId), names: [] });

  const unchanged =
    _sameTags(tags, recipe.tags) && LOCALES.every((locale) => search[locale] === recipe.search[locale]);
  if (unchanged) return { refreshed: false, merged, whole: true };

  await ctx.db.patch(recipeId, { tags, ...facets, search, updatedAt: Date.now() });

  return { refreshed: true, merged, whole: true };
};
