import { ConvexError } from "convex/values";

import type { Doc, Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";
import type { RecipeStatus } from "@convex/schema/recipes";
import { canonicalUrlOf } from "@shared/urls";

import { restoreReplaces } from "./restoreReplaces";

/**
 * A live recipe imported from `sourceUrl`, whoever imported it, and who that was; or `null`.
 *
 * What makes a share of a video someone already imported free: `importVideo` answers with that
 * recipe instead of paying for the model again, and the cook's app favorites it when it is not
 * theirs, so it lands on their shelf (ADR 0014: any signed-in cook may read and favorite it).
 * Live rows only, so a video whose imports were all deleted is imported afresh.
 *
 * `sourceUrl` is already canonical: the caller's adapter built it (`lib/socialVideo/`), as
 * `saveRecipe` stores it. When several cooks hold a copy (imports from before this lookup was
 * global), the oldest one answers.
 */
export const findBySource = async (
  ctx: QueryCtx,
  { sourceUrl }: { sourceUrl: string },
): Promise<{ recipeId: Id<"recipes">; userId?: Id<"users"> } | null> => {
  const recipe = await ctx.db
    .query("recipes")
    .withIndex("by_is_archived_and_source_url", (q) => q.eq("isArchived", false).eq("sourceUrl", sourceUrl))
    .first();

  return recipe ? { recipeId: recipe._id, userId: recipe.userId } : null;
};

type CatalogArgs = {
  /** Any spelling of the page: it is canonicalized here, as `saveRecipe` does before storing it. */
  url: string;
};

/**
 * The catalog recipe already imported from `url`, or `null`.
 *
 * The server half of the catalog import's dedupe; the script's ledger is the other, and the cheap
 * one. This half is the one that cannot be lost: a deleted or stale ledger re-sends a URL, and the
 * import answers with the recipe it already holds instead of creating a second one.
 *
 * Canonicalized here rather than trusted from the caller, because the index only matches the one
 * spelling `saveRecipe` stores, and a tracker left on would miss the row and duplicate the recipe.
 * Text that is not a web address throws rather than returning `null`: `null` means "the catalog
 * does not hold this page", which is an answer to go ahead on, and a broken address is not one.
 *
 * Catalog only, which is what `userId` absent selects on the index. A cook who imported the same
 * page into their own recipes owns a different row, and the catalog still wants its copy. Archived
 * rows included, unlike `findBySource`: the dedupe is against every row holding the page (C15
 * allowlists `findCatalogRowBySource` for it, and only it).
 */
export const findCatalogBySource = async (ctx: QueryCtx, args: CatalogArgs): Promise<Id<"recipes"> | null> =>
  (await findCatalogRowBySource(ctx, args))?._id ?? null;

/**
 * The catalog recipe a restore of `url` would land on, and whether the export's `status` replaces
 * it (`restoreReplaces`) — asked before the lines are resolved and the photos sent, so a page that
 * stays as it is costs nothing. `null` when the catalog does not hold the page.
 */
export const findRestoreTarget = async (
  ctx: QueryCtx,
  { url, status }: CatalogArgs & { status?: RecipeStatus },
): Promise<{ recipeId: Id<"recipes">; replaceable: boolean } | null> => {
  const existing = await findCatalogRowBySource(ctx, { url });

  return existing && { recipeId: existing._id, replaceable: restoreReplaces(existing.status, status) };
};

/** The same lookup, returning the row: the restore needs its `status` to decide on a replace. */
export const findCatalogRowBySource = async (ctx: QueryCtx, { url }: CatalogArgs): Promise<Doc<"recipes"> | null> => {
  const sourceUrl = canonicalUrlOf(url);
  if (!sourceUrl) {
    throw new ConvexError({ code: "INVALID_INPUT" as const, message: "Not a web address" });
  }

  return await ctx.db
    .query("recipes")
    .withIndex("by_user_and_source_url", (q) => q.eq("userId", undefined).eq("sourceUrl", sourceUrl))
    .first();
};
