import { imageBufferFromUrl } from "./image.buffer";
import sharp from "sharp";

type AspectRatio = `${number}:${number}`;
type Options = {
  customAspectRatio?: AspectRatio;
  returnFormat?: "webp" | "png" | "jpeg";
}

export const addImageBackground = async (base64OrUrlOrBuffer: string | Buffer<ArrayBufferLike>, backgroundColor: string, options?: Options) => {
  // Convert input to buffer
  let imageBuffer: Buffer;
  if (typeof base64OrUrlOrBuffer === "string") {
    imageBuffer = await imageBufferFromUrl(base64OrUrlOrBuffer);
  } else {
    imageBuffer = Buffer.from(base64OrUrlOrBuffer);
  }

  // Get original image dimensions
  const metadata = await sharp(imageBuffer).metadata();
  const originalWidth = metadata.width!;
  const originalHeight = metadata.height!;

  // Calculate target dimensions based on aspect ratio
  let targetWidth: number = originalWidth;
  let targetHeight: number = originalHeight;

  const { customAspectRatio } = options || {};

  if (customAspectRatio) {
    const [ratioW = 1, ratioH = 1] = customAspectRatio.split(":").map(Number);
    const targetRatio = ratioH !== 0 ? ratioW / ratioH : 1;
    // The ratio the SOURCE image actually has. Comparing the target against itself — which is what
    // this did — made the two always equal, so the "too wide" branch never ran and a landscape
    // image was padded on the left and right instead of the top and bottom.
    const currentRatio = originalHeight !== 0 ? originalWidth / originalHeight : 1;

    if (currentRatio > targetRatio) {
      // Image is too wide, add padding to top and bottom
      targetWidth = originalWidth;
      targetHeight = Math.round(originalWidth / targetRatio);
    } else {
      // Image is too tall, add padding to left and right
      targetHeight = originalHeight;
      targetWidth = Math.round(originalHeight * targetRatio);
    }
  } else {
    // No aspect ratio specified, use original dimensions
    targetWidth = originalWidth;
    targetHeight = originalHeight;
  }

  // Calculate position to center the original image
  const left = Math.max(0, Math.round((targetWidth - originalWidth) / 2));
  const top = Math.max(0, Math.round((targetHeight - originalHeight) / 2));

  // Create the image with background and centered product
  const result = await sharp({
    create: {
      width: targetWidth,
      height: targetHeight,
      channels: 4,
      background: backgroundColor,
    }
  })
    .composite([{
      input: imageBuffer,
      left: left,
      top: top,
    }])
    .toFormat(options?.returnFormat || "webp")
    .toBuffer();

  return result;
}
