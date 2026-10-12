import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { scheduleImageTreeDeletion } from "@convex/functions/media/imageTree";
import type { MutationCtx, TracedMutationCtx } from "@convex/procedures";
import type { PortableRecipe } from "@convex/schema/recipePayloads";

import { findCatalogBySource } from "./findCatalogBySource";
import { insertRecipe, recipeFactsOf } from "./insertRecipe";
import { mergeDuplicateLinks } from "./mergeDuplicateLinks";
import type { RecipeLink } from "./resolveRecipeIngredients";

export type UploadedImages = {
  coverImageId?: Id<"images">;
  plateImageId?: Id<"images">;
};

type Args = UploadedImages & {
  recipe: PortableRecipe;
  /** What the lines resolved to, already walked by the action that called this. */
  links: RecipeLink[];
  /** The spelling of every line no link stands for, so `search` still reaches the recipe by it. */
  unmatched: string[];
};

/**
 * Queue the photos uploaded for a recipe that will not be written, so they do not sit in the
 * bucket with no row pointing at them. Aimed through the image tree: a plate cut-out is deleted
 * with the base it was cut from, and a base whose cut-out never uploaded is its own root.
 */
export const discardUploadedImages = async (ctx: MutationCtx, imageIds: (Id<"images"> | undefined)[]) => {
  for (const imageId of imageIds) if (imageId) await scheduleImageTreeDeletion(ctx, imageId);
};

/**
 * The mutation half of the restore: the resolved recipe into a row.
 *
 * Everything is written as exported — every locale with its translation status, tags, cuisine,
 * timings, equipments, servings, `sourceUrl` — except what `insertRecipe` derives on every path:
 * `search`, the six facets and `shuffleKey`. The exported values of those three are ignored, each
 * for a rule: `search` has one serializer (ADR 0011), a facet follows its tag (ADR 0015), and a
 * shuffle key that matched across deployments would sample both catalogs in the same order.
 *
 * The catalog's `sourceUrl` is checked HERE, inside the transaction, even though the action checked
 * it first: the action's check saves the resolution, this one is the guard that holds. A page the
 * catalog already holds returns its id, writes nothing, and discards the photos uploaded for it.
 *
 * A recipe exported without a cover or a plate is restored without it, and `generateImages` is
 * scheduled for it as `createOne` does, so the catalog ends up whole.
 *
 * @limitation `generateImages` renders both photos, so a recipe restored without one gets the
 * other replaced as well; a spend taken knowingly for the rare case.
 */
export const persistRestoredRecipe = async (
  ctx: TracedMutationCtx,
  { recipe, links, unmatched, coverImageId, plateImageId }: Args,
): Promise<{ recipeId: Id<"recipes">; created: boolean }> => {
  const { row } = recipe;

  const existingId = row.sourceUrl ? await findCatalogBySource(ctx, { url: row.sourceUrl }) : null;
  if (existingId) {
    await discardUploadedImages(ctx, [coverImageId, plateImageId]);

    return { recipeId: existingId, created: false };
  }

  const merged = await mergeDuplicateLinks(ctx, { links });

  const recipeId = await insertRecipe(ctx, {
    // An export older than the column has no status; nothing had been reviewed on its way out.
    recipe: { ...recipeFactsOf({ ...row, status: row.status ?? "generated" }), coverImageId, plateImageId },
    links: merged.links,
    names: unmatched,
  });

  if (!coverImageId || !plateImageId) {
    await ctx.scheduleTracedAfter(0, internal.router.recipes.generateImages._internal, { recipeId });
  }

  return { recipeId, created: true };
};
