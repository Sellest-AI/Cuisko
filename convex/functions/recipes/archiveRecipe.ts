import type { Doc } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";

type Args = {
  /** Already loaded and owned: the router hands over `ctx.doc` from `ownedMutation`. */
  recipe: Doc<"recipes">;
};

/**
 * What a cook deleting their recipe does to it: takes it off every surface a recipe is chosen from,
 * and nothing else. See `recipes.isArchived` for why the row stays.
 *
 * Its lines, images, favorites and planned meals are all left alone: the meals are the reason the
 * row is kept, and the rest is what a meal opening it still shows. That is the difference from
 * `cascadeDelete`, which the catalog's hard delete runs.
 *
 * A recipe already archived is not written again, so a second tap does not bump `updatedAt`.
 */
export const archiveRecipe = async (ctx: MutationCtx, { recipe }: Args): Promise<void> => {
  if (recipe.isArchived) return;

  await ctx.db.patch(recipe._id, { isArchived: true, updatedAt: Date.now() });
};
