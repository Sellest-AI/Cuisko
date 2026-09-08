import { Infer } from "convex/values";
import { Id } from "@convex/_generated/dataModel";
import { MutationCtx } from "@convex/procedures";
import { IMAGE_TAGS } from "@convex/schema/media";

export type SaveImageArgs = {
  url: string;
  hashBase64: string;
  key: string;
  width: number;
  height: number;
  size: number;
  mimeType: string;
  alt?: string;
  hasAlpha?: boolean;
  tags?: Infer<typeof IMAGE_TAGS>;
  userId: Id<"users"> | null;
  object?: {
    x: number;
    y: number;
    baseImageId: Id<"images">;
  };
};

/**
 * Write an image row, or return the one already describing this bucket object.
 *
 * Idempotent on `key`, which the schema documents as unique and `uploadImage` takes from the file
 * it just stored. That matters because the callers reach this through `retryPromise` from an
 * action (`functions/media/uploadImage.ts`, `router/media/images/uploadSizes.ts`), which retries
 * every failure ten times by default. A mutation that commits but whose reply is lost is therefore
 * re-run, and an unconditional insert made that a SECOND `images` row for one stored file — the
 * first row then unreachable from anything that had not already captured its id, and its bucket
 * object owned by a row nobody returns. Retrying is only safe if arriving twice is.
 *
 * Convergent rather than merely skipped: a retry that died between the three writes below has left
 * some of them done, so each is guarded on its own rather than on whether the image existed. The
 * row itself is written either way — an insert or a patch — because `key` is caller-supplied on
 * the `server` mutation, and returning the row already at that key while discarding the incoming
 * bytes' dimensions would leave `plannedImageSizes` planning the ladder from the old ones.
 */
export const saveImage = async (ctx: MutationCtx, args: SaveImageArgs) => {
  const tags = [...new Set([...(args.tags ?? []), "IMAGE", args.hasAlpha ? "OBJECT" : null] as const)]
    .filter((v) => v !== null);

  const existing = await ctx.db
    .query("images")
    .withIndex("by_key", (q) => q.eq("key", args.key))
    .first();

  const fields = {
    url: args.url,
    hashBase64: args.hashBase64,
    key: args.key,
    width: args.width,
    height: args.height,
    size: args.size,
    mimeType: args.mimeType,
    alt: args.alt,
    tags: tags,
    updatedAt: Date.now(),
    hasAlpha: args.hasAlpha ?? false,
  };

  const image = existing?._id ?? await ctx.db.insert("images", fields);
  if (existing) await ctx.db.patch(existing._id, fields);

  if (args.object) {
    const object = args.object;

    // Matched on the PLACEMENT, not on the image: one cut-out can legitimately sit on more than
    // one background, and on a background more than once. Guarding on `imageId` alone would make
    // the first placement the only one an image ever gets, and `scheduleImageTreeDeletion` would
    // then aim its cleanup at whichever base happened to be recorded first.
    const placements = await ctx.db
      .query("imageObjects")
      .withIndex("by_image_id", (q) => q.eq("imageId", image))
      .collect();

    const alreadyPlaced = placements.some((placement) =>
      placement.baseImageId === object.baseImageId && placement.x === object.x && placement.y === object.y);

    if (!alreadyPlaced) await ctx.db.insert("imageObjects", {
      ...object,
      updatedAt: Date.now(),
      imageId: image,
    })
  }

  let imageUser: Id<"userImages"> | null = null;
  if (args.userId) {
    const userId = args.userId;
    const claims = await ctx.db
      .query("userImages")
      .withIndex("by_image_id", (q) => q.eq("imageId", image))
      .collect();

    imageUser = claims.find((claim) => claim.userId === userId)?._id
      ?? await ctx.db.insert("userImages", { imageId: image, userId });
  }

  const imageDb = await ctx.db.get(image);
  if (!imageDb) throw new Error(`Image not found`);

  return {
    ...imageDb,
    imageId: imageDb._id,
    userImageId: imageUser,
  }
}

export type SavedImage = Awaited<ReturnType<typeof saveImage>>;

/**
 * Write one rendition row, or return the one already describing this bucket object.
 *
 * The `imageSizes` half of the paragraph above: `uploadSizes` calls `saveSizes` under the same
 * `retryPromise`, and a duplicate row here is worse than a wasted one — `plannedImageSizes` reads
 * these back to decide which steps are already done.
 */
export const saveImageSize = async (ctx: MutationCtx, size: SaveImageSizeArgs) => {
  const existing = await ctx.db
    .query("imageSizes")
    .withIndex("by_key", (q) => q.eq("key", size.key))
    .first();

  // The parent is part of the match. A key held by a DIFFERENT image is not this rendition, and
  // treating it as one would suppress the insert — leaving `plannedImageSizes`, which reads by
  // `by_image_id`, to find the step missing and re-render and re-upload it on every run.
  if (existing && existing.imageId === size.imageId) return existing._id;

  return ctx.db.insert("imageSizes", size);
}

export type SaveImageSizeArgs = {
  imageId: Id<"images">;
  quality: number;
  key: string;
  width: number;
  height: number;
  url: string;
  size: number;
};
