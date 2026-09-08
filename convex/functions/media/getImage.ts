import { Id } from "../../_generated/dataModel";
import { QueryCtx } from "@convex/procedures";
import { sanitizeImage } from "./sanitizeImage";
import { ImageDoc, ImageWithObjectsDoc } from "@shared/media";

/**
 * Only the database is read here, so that is all a caller has to hand over — which lets the
 * ingredient catalog, whose helpers take `Pick<QueryCtx, "db">`, resolve an image without
 * widening their own ctx up to a full query context they never use.
 */
type ImageCtx = Pick<QueryCtx, "db">

export const getImage = async (ctx: ImageCtx, id: Id<"images">) => {
  const [image, sizes] = await Promise.all([
    ctx.db.get(id),
    ctx.db.query("imageSizes").withIndex("by_image_id", q => q.eq("imageId", id)).collect(),
  ]);

  if (!image) return null;

  return sanitizeImage({
    ...image,
    sizes,
  });
}

export const getImageWithObjects = async (ctx: ImageCtx, id: Id<"images">) => {
  const [image, sizes, objects] = await Promise.all([
    ctx.db.get(id),
    ctx.db.query("imageSizes").withIndex("by_image_id", q => q.eq("imageId", id)).collect(),
    ctx.db.query("imageObjects").withIndex("by_base_image_id", q => q.eq("baseImageId", id)).collect(),
  ]);

  if (!image) return null;

  return sanitizeImage({
    ...image,
    sizes,
    objects,
  });
}

export type GetImageDoc = ImageDoc | null;
export type GetImageWithObjectsDoc = ImageWithObjectsDoc | null;
