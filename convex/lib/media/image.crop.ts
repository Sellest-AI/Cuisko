import sharp from "sharp";

const ALPHA_THRESHOLD = 5;
const PERCENTAGE_THRESHOLD = 0.10;

type Response = {
  buffer: Buffer;
  original: { width: number; height: number };
  cropped: boolean;
  position: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
};

export async function cropImageFromBuffer(input: Buffer | string): Promise<Response> {
  const image = sharp(input);
  const { width: w = 0, height: h = 0 } = await image.metadata();

  // Extract raw RGBA pixel data. On its OWN sharp instance: `.raw()` mutates the pipeline it is
  // called on rather than returning a new one, so scanning through `image` left `image` in raw
  // mode — and the uncropped branch below, which returns `await image.toBuffer()`, then handed
  // back headerless RGBA bytes instead of an encoded image. The cropped branch hid it by calling
  // `.webp()`, which sets an output format again.
  const { data } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minX = w, minY = h, maxX = 0, maxY = 0;
  let hasVisiblePixel = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * 4 + 3] ?? 0;
      if (alpha > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        hasVisiblePixel = true;
      }
    }
  }

  if (!hasVisiblePixel) {
    throw new Error("No visible pixels found");
  }

  const left = minX;
  const top = minY;
  const newWidth = maxX - minX + 1;
  const newHeight = maxY - minY + 1;

  // Consider an image cropped only if we actually trim more than a certain percentage (e.g. 10% (PERCENTAGE_THRESHOLD))
  // to prevent unnecessary processing for insignificant borders.
  const widthDiffPercent = (w - newWidth) / w;
  const heightDiffPercent = (h - newHeight) / h;
  const cropped = widthDiffPercent > PERCENTAGE_THRESHOLD || heightDiffPercent > PERCENTAGE_THRESHOLD;

  let buffer: Buffer;
  let finalLeft = 0;
  let finalTop = 0;
  let finalWidth = w;
  let finalHeight = h;

  if (cropped) {
    buffer = await image
      .extract({ left, top, width: newWidth, height: newHeight })
      .webp({ quality: 100 })
      .toBuffer();
    finalLeft = left;
    finalTop = top;
    finalWidth = newWidth;
    finalHeight = newHeight;
  } else {
    buffer = input instanceof Buffer ? input : await image.toBuffer();
  }

  const position = { left: finalLeft, top: finalTop, width: finalWidth, height: finalHeight };

  return {
    buffer,
    original: { width: w, height: h },
    cropped,
    position,
  };
}
