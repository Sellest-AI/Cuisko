import type { Id } from "@convex/_generated/dataModel";
import type { PortableRecipe, RestoredPhotos } from "@convex/schema/recipePayloads";

import type { UploadedImages } from "./persistRestoredRecipe";

export type ImageUpload = {
  base64: string;
  /** Set for a plate cut-out: the base render it was cut from, uploaded first, and its offset. */
  object?: { baseImageId: Id<"images">; x: number; y: number };
};

type Upload = (image: ImageUpload) => Promise<Id<"images">>;

/**
 * A restored recipe's photos into this deployment: the cover, then the plate's base render, then
 * the plate cut-out as an object on that base, the order `generateImages` uploads them in. The
 * plate's offset is the exported one, read from `images.plate`.
 *
 * **A photo that fails is dropped, not thrown.** The recipe is restored without it, and
 * `persistRestoredRecipe` schedules `generateImages` for a recipe missing a cover or a plate, as it
 * does for one exported without them. A plate is kept whole or not at all, as the export treats it;
 * so a base whose cut-out then fails is returned in `stranded`, for the caller to discard.
 *
 * `kept` lists the ids in `uploaded`, for the caller to discard if the recipe is then not written.
 */
export const uploadRestoredImages = async (
  { images: { plate } }: Pick<PortableRecipe, "images">,
  photos: RestoredPhotos,
  upload: Upload,
): Promise<{ uploaded: UploadedImages; kept: Id<"images">[]; stranded: Id<"images">[] }> => {
  const tryUpload = async (name: string, image: ImageUpload) => {
    try {
      return await upload(image);
    } catch (error) {
      console.warn(`restore: the ${name} photo did not upload, it will be regenerated`, error);

      return undefined;
    }
  };

  const uploaded: UploadedImages = {};
  const stranded: Id<"images">[] = [];

  if (photos.cover) uploaded.coverImageId = await tryUpload("cover", { base64: photos.cover });
  if (plate && photos.plate && photos.plateBase) {
    const baseImageId = await tryUpload("plate base", { base64: photos.plateBase });
    if (baseImageId) {
      uploaded.plateImageId = await tryUpload("plate", {
        base64: photos.plate,
        object: { baseImageId, x: plate.x, y: plate.y },
      });
      if (!uploaded.plateImageId) stranded.push(baseImageId);
    }
  }

  const kept = [uploaded.coverImageId, uploaded.plateImageId].filter((imageId): imageId is Id<"images"> => !!imageId);

  return { uploaded, kept, stranded };
};
