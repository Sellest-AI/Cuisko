import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ActionCtx } from "@convex/procedures";
import type { PortableRecipe, RestoredPhotos } from "@convex/schema/recipePayloads";

import { type RecipeLink, resolveRecipeIngredients } from "./resolveRecipeIngredients";
import { type ImageUpload, uploadRestoredImages } from "./uploadRestoredImages";

type Args = {
  recipe: PortableRecipe;
  /** The recipe's photo files from the zip, base64. Uploaded here, and only once it is known new. */
  photos: RestoredPhotos;
};

export type RestoredRecipe = {
  recipeId: Id<"recipes">;
  /** `false` when the catalog already held the page and nothing was written. */
  created: boolean;
  /** The lines the resolver refused, by the name they were exported under. Dropped, not guessed. */
  unmatched: string[];
};

/**
 * The locale the lines are resolved in. The catalog's French name is the spelling the import wrote
 * the recipe from; a line with none is resolved by its English one, in the same walk.
 */
const RESOLVE_LOCALE = "fr";

/** One photo through `uploadMany`, which takes a batch and is handed a batch of one. */
const _uploadOne = async (ctx: ActionCtx, image: ImageUpload): Promise<Id<"images">> => {
  const [saved] = await ctx.runAction(internal.router.media.images.uploadMany._internal, {
    userId: null,
    images: [image],
  });
  if (!saved) throw new Error("uploadMany returned no image");

  return saved._id;
};

const _spelledName = ({ name }: PortableRecipe["ingredients"][number]["ingredient"]): string =>
  name.values[RESOLVE_LOCALE] ?? name.values.en ?? "";

/**
 * One portable recipe into this deployment's catalog.
 *
 * The action half: it resolves the lines and hands the answer to `persistRestoredRecipe`, the same
 * split as `createOne`, and for the same reason — linking a name may reach two datasets, two live
 * APIs and a model, and a mutation may do none of those.
 *
 * **Every line goes through `resolveRecipeIngredients`, exactly as a created recipe's do.** The
 * exported name is the other deployment's catalog spelling, so the walk's first step — this
 * catalog, by name — answers a seeded ingredient without a model call, and a food this catalog
 * has never held is created for it rather than dropped. What can still come back unlinked is only
 * what the resolver refused, and that is reported in `unmatched`; a walk that did not finish
 * (`complete: false`) throws instead, so the script reports the recipe failed and a re-run retries
 * it, finding the rows the first walk created by name.
 *
 * A page the catalog already holds returns its id before any resolution or upload is paid for. The
 * persist mutation checks again inside its transaction; this check is the one that saves the work.
 *
 * **The photos are uploaded here, after the lines resolve and just before the write.** A photo that
 * fails is left out and regenerated (`uploadRestoredImages`). If the write itself throws, the
 * uploads are discarded before the error goes on: only this action knows whether the row was
 * written, which a caller whose connection dropped after the write could not tell.
 */
export const restoreRecipe = async (
  ctx: ActionCtx,
  { recipe, photos }: Args,
): Promise<RestoredRecipe> => {
  const { row, ingredients } = recipe;

  const existingId = row.sourceUrl
    ? await ctx.runQuery(internal.router.recipes.importOne._internal_find, { url: row.sourceUrl })
    : null;
  if (existingId) return { recipeId: existingId, created: false, unmatched: [] };

  // The resolver positions its links by index into the list it is handed, so the list is walked in
  // position order and each link is stamped with the exported position afterwards.
  const lines = [...ingredients].sort((a, b) => a.position - b.position);
  const { links: byIndex, complete } = await resolveRecipeIngredients(ctx, {
    recipe: {
      ingredients: lines.map(({ ingredient, quantity, unit, fatUse }) => ({
        name: _spelledName(ingredient),
        quantity,
        unit,
        ...(fatUse && { fatUse }),
      })),
    },
    locale: RESOLVE_LOCALE,
  });
  // A line left unlinked by a blip (an API down, a model timeout, a walk cap) is not a refusal, and
  // must not be saved as one: the recipe would be written short for good, and the ledger would stop
  // a re-run from retrying it. Thrown before any photo is uploaded, so there is nothing to discard.
  if (!complete) throw new Error("some ingredient lines could not be resolved this time; retry the restore");

  const links: RecipeLink[] = byIndex.map((link) => ({ ...link, position: lines[link.position]!.position }));
  const linked = new Set(links.map((link) => link.position));
  const unmatched = lines.filter((line) => !linked.has(line.position)).map((line) => _spelledName(line.ingredient));

  const discard = (imageIds: Id<"images">[]) =>
    ctx.runMutation(internal.router.recipes.restoreOne._internal_discardImages, { imageIds });
  const { uploaded, kept, stranded } = await uploadRestoredImages(recipe, photos, (image) => _uploadOne(ctx, image));
  if (stranded.length) await discard(stranded);

  try {
    const { recipeId, created } = await ctx.runMutation(internal.router.recipes.restoreOne._internal_persist, {
      recipe,
      links,
      unmatched,
      ...uploaded,
    });

    return { recipeId, created, unmatched: created ? unmatched : [] };
  } catch (error) {
    if (kept.length) await discard(kept);
    throw error;
  }
};
