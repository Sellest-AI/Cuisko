import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { TracedActionCtx } from "@convex/procedures";
import type { PortableIngredient, RestoredIngredientImage } from "@convex/schema/ingredientPayloads";

type Args = {
  ingredient: PortableIngredient;
  /** The image files from the zip, base64. Uploaded only once the row is written and wants them. */
  image?: RestoredIngredientImage;
};

/** What a restore did with one ingredient. */
export type RestoreOutcome = "created" | "imageAdded" | "existing";

export type RestoredIngredient = { ingredientId: Id<"ingredients">; outcome: RestoreOutcome };

type Upload = { base64: string; object?: { baseImageId: Id<"images">; x: number; y: number } };

const _uploadOne = async (ctx: TracedActionCtx, image: Upload): Promise<Id<"images">> => {
  const [saved] = await ctx.runTracedAction(internal.router.media.images.uploadMany._internal, {
    userId: null,
    images: [image],
  });
  if (!saved) throw new Error("uploadMany returned no image");

  return saved._id;
};

/**
 * The pair uploaded the way `generateImageNode` uploads it: the base render, then the cut-out as an
 * object on it at the exported offset. The cut-out's id is the one the row points at.
 *
 * **A failed upload is dropped, not thrown**: the ingredient stays without an image, as one
 * exported without it is. A base whose cut-out then fails points at nothing and is deleted.
 */
const _uploadPair = async (
  ctx: TracedActionCtx,
  { x, y }: NonNullable<PortableIngredient["image"]>,
  files: NonNullable<RestoredIngredientImage>,
): Promise<Id<"images"> | undefined> => {
  const tryUpload = async (name: string, image: Upload) => {
    try {
      return await _uploadOne(ctx, image);
    } catch (error) {
      console.warn(`restore: the ingredient's ${name} did not upload, it stays without an image`, error);

      return undefined;
    }
  };

  const baseImageId = await tryUpload("base render", { base64: files.base });
  if (!baseImageId) return undefined;

  const imageId = await tryUpload("cut-out", { base64: files.image, object: { baseImageId, x, y } });
  // The base has nothing placed on it yet, so it is its own tree: queued for deletion directly, as
  // `scheduleImageTreeDeletion` would, rather than kept in the bucket with nothing pointing at it.
  if (!imageId) await ctx.scheduler.runAfter(0, internal.router.media.images.deleteOne._internal, { imageId: baseImageId });

  return imageId;
};

/**
 * One portable ingredient into this deployment. **The row is written first, the image uploaded
 * after**, so nothing is uploaded for an ingredient that is refused or already has its image:
 *
 * 1. `_internal_persist` matches the row, inserts it when the deployment lacks it, and says whether
 *    it still wants an image. A row it refuses throws before any upload.
 * 2. Only then are the zip's files uploaded, and the cut-out attached (`_internal_attachImage`).
 *
 * Nothing here calls a model. The facts arrive whole, and a missing image stays missing.
 */
export const restoreIngredient = async (
  ctx: TracedActionCtx,
  { ingredient, image }: Args,
): Promise<RestoredIngredient> => {
  const { ingredientId, created, needsImage } = await ctx.runMutation(
    internal.router.ingredients.restoreOne._internal_persist,
    { ingredient },
  );

  const imageId = needsImage && ingredient.image && image ? await _uploadPair(ctx, ingredient.image, image) : undefined;
  if (imageId) {
    await ctx.runMutation(internal.router.ingredients.restoreOne._internal_attachImage, { ingredientId, imageId });
  }

  return { ingredientId, outcome: created ? "created" : imageId ? "imageAdded" : "existing" };
};
