import { internal } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { scheduleImageTreeDeletion } from "@convex/functions/media/imageTree";
import type { MutationCtx, TracedMutationCtx } from "@convex/procedures";
import type { PortableRecipe } from "@convex/schema/recipePayloads";

import { findCatalogRowBySource } from "./findCatalogBySource";
import { derivedRecipeColumns, insertRecipe, type RecipeFacts, recipeFactsOf } from "./insertRecipe";
import { mergeDuplicateLinks } from "./mergeDuplicateLinks";
import { replaceRecipeImages } from "./recipeImages";
import type { RecipeLink } from "./resolveRecipeIngredients";
import { restoreReplaces } from "./restoreReplaces";
import { syncRecipeLinks } from "./syncRecipeLinks";

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
 * The exported recipe written over a `generated` catalog row of the same page, keeping the row.
 *
 * The `_id` is what meal plans and favorites point at, so the row is replaced rather than deleted
 * and reinserted. With it stay what is this deployment's own: `shuffleKey` and the stored
 * `sourceUrl` spelling. Everything else is the export's, the derived columns recomputed by
 * `derivedRecipeColumns` as an insert's are, and the photos are left for `replaceRecipeImages` to
 * swap. The lines go through `syncRecipeLinks`, so a line the export kept keeps its row id.
 *
 * An archived copy comes back live: replacing it with the review is a decision to show the review,
 * and a restore never writes a deleted recipe.
 */
const _replaceInPlace = async (
  ctx: MutationCtx,
  existing: Doc<"recipes">,
  { facts, links, unmatched }: { facts: RecipeFacts; links: RecipeLink[]; unmatched: string[] },
) => {
  const merged = await mergeDuplicateLinks(ctx, { links });
  const rows = await ctx.db
    .query("recipeIngredients")
    .withIndex("by_recipe", (q) => q.eq("recipeId", existing._id))
    .collect();

  await ctx.db.replace(existing._id, {
    ...facts,
    sourceUrl: existing.sourceUrl,
    coverImageId: existing.coverImageId,
    plateImageId: existing.plateImageId,
    ...(await derivedRecipeColumns(ctx, { tags: facts.tags, links: merged.links, names: unmatched })),
    shuffleKey: existing.shuffleKey,
    isArchived: false,
  });

  await syncRecipeLinks(ctx, { recipeId: existing._id, rows, links: merged.links });
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
 * catalog already holds returns its id, writes nothing, and discards the photos uploaded for it —
 * unless `restoreReplaces` says the export upgrades it, and then it is replaced in place
 * (`_replaceInPlace`).
 *
 * A recipe exported without a cover or a plate is restored without it, and `generateImages` is
 * scheduled for it as `createOne` does, so the catalog ends up whole. A replace schedules it too
 * when the row, once its photos are swapped, still lacks one.
 *
 * @limitation `generateImages` renders both photos, so a recipe restored without one gets the
 * other replaced as well; a spend taken knowingly for the rare case.
 */
export const persistRestoredRecipe = async (
  ctx: TracedMutationCtx,
  { recipe, links, unmatched, coverImageId, plateImageId }: Args,
): Promise<{ recipeId: Id<"recipes">; created: boolean; replaced?: true }> => {
  const { row } = recipe;
  // An export older than the column has no status; nothing had been reviewed on its way out.
  const facts = recipeFactsOf({ ...row, status: row.status ?? "generated" });

  const existing = row.sourceUrl ? await findCatalogRowBySource(ctx, { url: row.sourceUrl }) : null;
  if (existing && restoreReplaces(existing.status, row.status)) {
    await _replaceInPlace(ctx, existing, { facts, links, unmatched });
    await replaceRecipeImages(ctx, { recipeId: existing._id, coverImageId, plateImageId });
    // A photo that did not arrive leaves the row's own; only a row that has neither is rendered.
    if (!(coverImageId ?? existing.coverImageId) || !(plateImageId ?? existing.plateImageId)) {
      await _generateImages(ctx, existing._id);
    }

    return { recipeId: existing._id, created: false, replaced: true };
  }
  if (existing) {
    await discardUploadedImages(ctx, [coverImageId, plateImageId]);

    return { recipeId: existing._id, created: false };
  }

  const merged = await mergeDuplicateLinks(ctx, { links });

  const recipeId = await insertRecipe(ctx, {
    recipe: { ...facts, coverImageId, plateImageId },
    links: merged.links,
    names: unmatched,
  });

  if (!coverImageId || !plateImageId) await _generateImages(ctx, recipeId);

  return { recipeId, created: true };
};

const _generateImages = (ctx: TracedMutationCtx, recipeId: Id<"recipes">) =>
  ctx.scheduleTracedAfter(0, internal.router.recipes.generateImages._internal, { recipeId });
