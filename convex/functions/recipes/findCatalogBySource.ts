import type { Doc, Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";
import type { RecipeStatus } from "@convex/schema/recipes";
import { canonicalUrlOf } from "@shared/urls";
import { ConvexError } from "convex/values";

import { restoreReplaces } from "./restoreReplaces";

type Args = {
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
 * page into their own recipes owns a different row, and the catalog still wants its copy.
 */
export const findCatalogBySource = async (ctx: QueryCtx, args: Args): Promise<Id<"recipes"> | null> =>
  (await findCatalogRowBySource(ctx, args))?._id ?? null;

/**
 * The catalog recipe a restore of `url` would land on, and whether the export's `status` replaces
 * it (`restoreReplaces`) — asked before the lines are resolved and the photos sent, so a page that
 * stays as it is costs nothing. `null` when the catalog does not hold the page.
 */
export const findRestoreTarget = async (
  ctx: QueryCtx,
  { url, status }: Args & { status?: RecipeStatus },
): Promise<{ recipeId: Id<"recipes">; replaceable: boolean } | null> => {
  const existing = await findCatalogRowBySource(ctx, { url });

  return existing && { recipeId: existing._id, replaceable: restoreReplaces(existing.status, status) };
};

/** The same lookup, returning the row: the restore needs its `status` to decide on a replace. */
export const findCatalogRowBySource = async (ctx: QueryCtx, { url }: Args): Promise<Doc<"recipes"> | null> => {
  const sourceUrl = canonicalUrlOf(url);
  if (!sourceUrl) {
    throw new ConvexError({ code: "INVALID_INPUT" as const, message: "Not a web address" });
  }

  return await ctx.db
    .query("recipes")
    .withIndex("by_user_and_source_url", (q) => q.eq("userId", undefined).eq("sourceUrl", sourceUrl))
    .first();
};
