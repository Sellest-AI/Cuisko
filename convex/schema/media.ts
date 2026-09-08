import { defineTable } from "convex/server";
import { v } from "convex/values";

export const IMAGE_TAGS = v.array(v.union(
  v.literal("IMAGE"),
  v.literal("OBJECT"),
))

/**
 * One image as an upload endpoint accepts it — a URL or a base64 blob, never neither.
 *
 * Both are optional in the validator because either one satisfies the call; the "not neither" half
 * cannot be said in a validator and is enforced in `functions/media/uploadImage.ts`. It lives here
 * rather than in a router file because `uploadOne` and `uploadMany` both take it, and a validator
 * exported from a router breaks the C1 export grammar.
 */
export const vUploadImage = v.object({
  base64: v.optional(v.string()),
  url: v.optional(v.string()),
  object: v.optional(v.object({
    baseImageId: v.id("images"),
    x: v.number(),
    y: v.number(),
  })),
  tags: v.optional(IMAGE_TAGS),
  autoCrop: v.optional(v.boolean()),
});

export const images = defineTable({
  hasAlpha: v.boolean(), // true if is rgba with transparent pixels
  hashBase64: v.optional(v.string()), // Hash of the image content
  key: v.string(), // Unique key
  url: v.string(),
  width: v.number(),
  height: v.number(),
  size: v.number(),
  mimeType: v.string(),
  alt: v.optional(v.string()),
  tags: IMAGE_TAGS,
  updatedAt: v.number(),
}).index("by_hash_base64", ["hashBase64"])
  // `key` is the bucket object this row describes, and one object has one row. Indexed so
  // `saveImage` can be idempotent — see the note there for what the unconditional insert cost.
  .index("by_key", ["key"])

/**
 * A derived rendition of an image at one width and quality.
 *
 * @immutable a size is written once by `uploadSizes` and never edited — a different quality or
 * width is a different row, and a re-render replaces the row rather than patching it.
 */
export const imageSizes = defineTable({
  imageId: v.id("images"), // Reference to the parent Image
  quality: v.number(),
  key: v.string(), // Unique key
  width: v.number(),
  height: v.number(),
  url: v.string(),
  size: v.number(),
}).index("by_image_id", ["imageId"])
  .index("by_key", ["key"]);

export const imageObjects = defineTable({
  imageId: v.id("images"), // Reference to the Image
  baseImageId: v.id("images"), // Reference to the base Image
  x: v.number(),
  y: v.number(),
  updatedAt: v.number(),
}).index("by_image_id", ["imageId"])
  .index("by_base_image_id", ["baseImageId"]);

export const userImages = defineTable({
  userId: v.id("users"),
  imageId: v.id("images"),
})
  .index("by_image_id", ["imageId"])
  .index("by_user_id", ["userId"]);
