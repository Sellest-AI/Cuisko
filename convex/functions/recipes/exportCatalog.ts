import type { PaginationOptions, PaginationResult } from "convex/server";

import type { Doc, Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";
import type { PortableRecipe } from "@convex/schema/recipePayloads";

type ExportCtx = Pick<QueryCtx, "db">;

type Args = {
  paginationOpts: PaginationOptions;
};

/**
 * The cover's URL, or nothing when the recipe has none or the row is gone.
 *
 * A dangling id is treated as no image rather than thrown on: the cascade detaches a deleted
 * image from its recipe in a scheduled step, and an export that lands between the delete and the
 * detach should still export the recipe.
 */
const _coverOf = async (ctx: ExportCtx, coverImageId?: Id<"images">) => {
  const cover = coverImageId ? await ctx.db.get(coverImageId) : null;

  return cover ? { url: cover.url } : undefined;
};

/**
 * The plate cut-out with the base render it was cut from and where it sits on it.
 *
 * `generateImages` uploads the plate as an object on its base, so the pair is one `imageObjects`
 * row away. A plate with no such row cannot be rebuilt by the restore, which uploads the base first
 * and cuts the plate from it, so it is exported as no plate rather than as half of one.
 */
const _plateOf = async (ctx: ExportCtx, plateImageId?: Id<"images">) => {
  const plate = plateImageId ? await ctx.db.get(plateImageId) : null;
  if (!plate) return undefined;

  const object = await ctx.db
    .query("imageObjects")
    .withIndex("by_image_id", (q) => q.eq("imageId", plate._id))
    .first();
  const base = object ? await ctx.db.get(object.baseImageId) : null;
  if (!object || !base) return undefined;

  return { url: plate.url, base: { url: base.url }, x: object.x, y: object.y };
};

/**
 * Every line of the recipe with its ingredient spelled out — `slug`, `name`, `aliases` — instead of
 * pointed at, in position order.
 *
 * A line whose ingredient row is gone is dropped: there is no name to carry, and the restore could
 * match nothing from an id it does not share.
 */
const _ingredientsOf = async (ctx: ExportCtx, recipeId: Id<"recipes">): Promise<PortableRecipe["ingredients"]> => {
  const lines = await ctx.db
    .query("recipeIngredients")
    .withIndex("by_recipe", (q) => q.eq("recipeId", recipeId))
    .collect();

  const portable: PortableRecipe["ingredients"] = [];
  for (const { ingredientId, position, quantity, unit } of lines) {
    const ingredient = await ctx.db.get(ingredientId);
    if (!ingredient) continue;

    const { slug, name, aliases } = ingredient;
    portable.push({ position, quantity, unit, ingredient: { slug, name, aliases } });
  }

  return portable.sort((a, b) => a.position - b.position);
};

const _portableRecipeOf = async (ctx: ExportCtx, recipe: Doc<"recipes">): Promise<PortableRecipe> => {
  const { _id, _creationTime, userId: _userId, coverImageId, plateImageId, ...row } = recipe;

  return {
    origin: { recipeId: _id, creationTime: _creationTime },
    row,
    ingredients: await _ingredientsOf(ctx, _id),
    images: { cover: await _coverOf(ctx, coverImageId), plate: await _plateOf(ctx, plateImageId) },
  };
};

/**
 * One page of the catalog — the recipes nobody owns — in the portable shape `catalog:restore`
 * reads, oldest first so a page order is stable across runs.
 *
 * Catalog only, which is what `userId` absent selects on `by_user`: a cook's own recipes are
 * theirs, and moving them between deployments would move them out from under their owner. The
 * predicate is in the index and not in a `.filter()`, so a page of `numItems` holds `numItems`
 * recipes (ADR 0007, C3).
 *
 * The cursor and `isDone` pass through untouched, as in `listForUser`: the mapping is one to one,
 * and a page that rewrote them would answer for a set it did not read.
 */
export const exportCatalog = async (
  ctx: ExportCtx,
  { paginationOpts }: Args,
): Promise<PaginationResult<PortableRecipe>> => {
  const page = await ctx.db
    .query("recipes")
    .withIndex("by_user", (q) => q.eq("userId", undefined))
    .paginate(paginationOpts);

  const portable: PortableRecipe[] = [];
  for (const recipe of page.page) portable.push(await _portableRecipeOf(ctx, recipe));

  return { ...page, page: portable };
};
