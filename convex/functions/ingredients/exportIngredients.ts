import type { PaginationOptions, PaginationResult } from "convex/server";

import type { Doc } from "@convex/_generated/dataModel";
import { imagePairOf } from "@convex/functions/media/imageTree";
import type { QueryCtx } from "@convex/procedures";
import type { PortableIngredient } from "@convex/schema/ingredientPayloads";

type ExportCtx = Pick<QueryCtx, "db">;

type Args = {
  paginationOpts: PaginationOptions;
};

const _portableIngredientOf = async (ctx: ExportCtx, ingredient: Doc<"ingredients">): Promise<PortableIngredient> => {
  const { _id, _creationTime, imageId, search: _search, nutriScore: _nutriScore, updatedAt: _updatedAt, ...row } =
    ingredient;

  return {
    origin: { ingredientId: _id, creationTime: _creationTime },
    row,
    image: await imagePairOf(ctx, imageId),
  };
};

/**
 * One page of the ingredient catalog, oldest first, in the portable shape `ingredients:restore`
 * reads.
 *
 * Every row, seeded or grown by a cook's typing: the table has no owner, so there is no subset to
 * select. Oldest first on `by_creation_time` so a page order is stable across runs, and the cursor
 * and `isDone` pass through untouched, as in `exportCatalog`.
 *
 * An image whose base render cannot be found is exported as no image (`imagePairOf`): the restore
 * rebuilds the pair from its base, so half of one is nothing it could write.
 */
export const exportIngredients = async (
  ctx: ExportCtx,
  { paginationOpts }: Args,
): Promise<PaginationResult<PortableIngredient>> => {
  const page = await ctx.db.query("ingredients").withIndex("by_creation_time").paginate(paginationOpts);

  const portable: PortableIngredient[] = [];
  for (const ingredient of page.page) portable.push(await _portableIngredientOf(ctx, ingredient));

  return { ...page, page: portable };
};
