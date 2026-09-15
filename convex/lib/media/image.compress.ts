import sharp from "sharp";
import { imageBufferFromUrl } from "./image.buffer";

type Level = {
  resolution: number;
  targetSizeKb: number;
  initialQuality: number;
  compressionStrength: {
    sizeKb: number;
    initialQuality: number;
  }[]
}

type Compression = Omit<Level, "compressionStrength">;

const compression8k: Level = {
  resolution: 8 * 1024,
  targetSizeKb: 4 * 1024,
  initialQuality: 60,
  compressionStrength: [
    { sizeKb: 20 * 1024, initialQuality: 40 }
  ]
}

const compression4k: Level = {
  resolution: 4 * 1024,
  targetSizeKb: Math.round(1.3 * 1024),
  initialQuality: 90,
  compressionStrength: [
    { sizeKb: 20 * 1024, initialQuality: 60 },
    { sizeKb: 10 * 1024, initialQuality: 75 },
    { sizeKb: 4 * 1024, initialQuality: 83 },
    { sizeKb: 2 * 1024, initialQuality: 87 },
  ]
}

const compression2k: Level = {
  resolution: 2 * 1024,
  targetSizeKb: 500,
  initialQuality: 92,
  compressionStrength: [
    { sizeKb: 8 * 1024, initialQuality: 70 },
    { sizeKb: 4 * 1024, initialQuality: 76 },
    { sizeKb: 2 * 1024, initialQuality: 81 },
    { sizeKb: 1 * 1024, initialQuality: 86 },
  ]
}

const compression1k: Level = {
  resolution: 1024,
  targetSizeKb: 300,
  initialQuality: 96,
  compressionStrength: [
    { sizeKb: 4 * 1024, initialQuality: 88 },
    { sizeKb: 2 * 1024, initialQuality: 90 },
    { sizeKb: 1 * 1024, initialQuality: 92 },
    { sizeKb: 0.4 * 1024, initialQuality: 94 },
  ]
}

const compression512: Level = {
  resolution: 512,
  targetSizeKb: 220,
  initialQuality: 96,
  compressionStrength: [
    { sizeKb: 2 * 1024, initialQuality: 88 },
    { sizeKb: 1 * 1024, initialQuality: 90 },
    { sizeKb: 0.5 * 1024, initialQuality: 92 },
    { sizeKb: 0.2 * 1024, initialQuality: 94 },
  ]
}

const compressions: Level[] = [
  compression8k,
  compression4k,
  compression2k,
  compression1k,
  compression512,
];

export const getCompression = (resolution: number, sizeKb: number): Compression => {
  // Tolerance percentage for matching resolutions
  const THRESHOLD_PERCENT = 0.2;

  // Sort compressions by resolution in descending order
  const sortedCompressions = compressions.sort((a, b) => b.resolution - a.resolution);

  // Find the compression level where the resolution is within the threshold percentage
  const compressionIndex = sortedCompressions.findIndex(
    (c) => resolution >= c.resolution * (1 - THRESHOLD_PERCENT)
  );
  const compression = sortedCompressions[compressionIndex];

  // If no suitable compression is found (image resolution is very small)
  if (!compression) {
    // Use the smallest compression level
    const compression = sortedCompressions[sortedCompressions.length - 1]!;
    const minKb = 10; // Minimum target size in KB
    const maxKb = compression.targetSizeKb;

    // Scale the target size based on the ratio of the current resolution to the compression's resolution
    const targetSizeKb = Math.max(minKb, (maxKb * resolution) / compression.resolution);
    return {
      ...compression,
      resolution,
      targetSizeKb,
    };
  }

  // Sort the compression strengths by size (descending)
  const sortedStrengths = compression.compressionStrength.sort((a, b) => b.sizeKb - a.sizeKb);

  // Find the compression strength level based on the size of the image
  const strengthIndex = sortedStrengths.findIndex((s) => sizeKb >= s.sizeKb);

  // If no suitable strength is found, use the default compression's initial quality
  if (strengthIndex === -1) {
    return { ...compression, initialQuality: compression.initialQuality };
  }

  // Use the matched compression strength
  const strength = sortedStrengths[strengthIndex]!;

  // If it's the strongest compression strength, use its initial quality directly
  if (strengthIndex === 0) {
    return { ...compression, initialQuality: strength.initialQuality };
  }

  // Lerp the initial quality between the current strength and the previous one
  const previousStrength = sortedStrengths[strengthIndex - 1]!;
  const factor = (sizeKb - strength.sizeKb) / (previousStrength.sizeKb - strength.sizeKb);

  // Calculate interpolated initial quality based on size difference
  const initialQuality =
    strength.initialQuality +
    (previousStrength.initialQuality - strength.initialQuality) * factor;

  // If the resolution matches perfectly or it's the highest compression level, return the result
  const isPerfectResolution = resolution === compression.resolution;
  if (compressionIndex === 0 || isPerfectResolution) {
    return { ...compression, initialQuality };
  }

  // Scale the target size for the current resolution
  const nextLevelCompression = compressions[compressionIndex - 1]!;
  const minKb = compression.targetSizeKb;
  const maxKb = nextLevelCompression.targetSizeKb;

  // Scale the target size based on the ratio of the current resolution to the next level's resolution
  const targetSizeKb = Math.max(minKb, (maxKb * resolution) / nextLevelCompression.resolution);

  return {
    ...compression,
    targetSizeKb,
    initialQuality,
  };
};

const lerpValue = (x: number, range: [number, number], output: [number, number]) => x <= range[0] ? output[0] : x >= range[1] ? output[1] : output[0] + (output[1] - output[0]) * (1 - (x - range[0]) / (range[1] - range[0]));

type Options = {
  maxSideSize?: number;
  quality?: number;
  mimeType?: "image/webp" | "image/png";
}

export const compressImage = async (image: Buffer | string, options?: Options) => {
  const buffer = typeof image === "string" ? await imageBufferFromUrl(image) : image;

  const metadata = await sharp(buffer).metadata(); // Get the image's metadata

  const mimeType = options?.mimeType ?? "image/webp";

  // Scale effort from 0 to 6 based on resolution
  const maxSide = Math.max(metadata.width ?? 0, metadata.height ?? 0);
  const effort = lerpValue(maxSide, [2048, 4096], [6, 0]);

  const quality = (() => {
    if (!options?.quality) return undefined;
    const _quality = Math.round(options.quality);
    const lerpedQuality = lerpValue(effort, [6, 0], [_quality, _quality * 0.95]);
    return Math.round(lerpedQuality);
  })();

  let transformer = sharp(buffer).rotate();
  if (mimeType === "image/png") {
    // Map quality (0-100) to compressionLevel (0-9)
    // Lower quality = higher compression = smaller file
    const compressionLevel = Math.round((100 - (quality ?? 0)) / 100 * 9);
    transformer = transformer.png({ compressionLevel });
  }
  else
    transformer = transformer.webp({
      quality: quality ? Math.round(quality) : undefined,
      effort: Math.round(effort)
    });

  const { width, height } = { width: metadata.width ?? 0, height: metadata.height ?? 0 }
  const maxSideSize = options?.maxSideSize ?? Infinity;
  // `fit: "inside"` caps the longest side whichever axis it turns out to be, so this never has to
  // ask which one that is. Choosing the axis from `metadata` was wrong: the transformer opens with
  // `.rotate()`, and an EXIF-orientation-6 portrait reports its dimensions swapped — `width >
  // height` held for an image that came out 1440x1920, so the SHORT side was capped and the result
  // was a 1920px "1440" rendition. `plannedImageSizes` matches on longest side, never saw its 1440,
  // and re-rendered the step on every run. The guard below is orientation-safe already: `Math.max`
  // of a swapped pair is the same number.
  if (Math.max(width, height) > maxSideSize) {
    transformer = transformer.resize({ width: maxSideSize, height: maxSideSize, fit: "inside" });
  }

  const newBuffer = await transformer.toBuffer();
  const newMetadata = await sharp(newBuffer).metadata()

  // From `newMetadata`, not the `metadata` read at the top: the transformer starts with `.rotate()`,
  // which bakes in EXIF orientation, and may `.resize()`. Both change the dimensions, so the source
  // metadata describes a buffer this function is not returning — a portrait phone photo (EXIF
  // orientation 6) reported its width and height swapped, and `uploadImage` wrote that onto the row.
  return {
    width: newMetadata.width ?? width,
    height: newMetadata.height ?? height,
    metadata: newMetadata,
    buffer: newBuffer,
    mimeType: mimeType,
    size: newBuffer.length,
  }
}

type CompressImageAutoOptions = {
  format?: "webp" | "png";
  maxSizeKb?: number;
}
export const compressImageAuto = async (image: Buffer | string, options?: CompressImageAutoOptions) => {
  const buffer = typeof image === "string" ? await imageBufferFromUrl(image) : image;
  const metadata = await sharp(buffer).metadata(); // Get the image's metadata

  const toKb = (size: number) => Math.round(size / 1024);

  const { width, height } = {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
  };

  const sizeKb = toKb(buffer.length);
  const dimensions = Math.max(width, height);
  const compression = getCompression(dimensions, sizeKb);

  const forceCompression = !["webp", "png", "jpeg"].includes(metadata.format ?? "avif") ||
    (options?.format !== undefined && options.format !== metadata.format);

  if (!forceCompression) {
    const maxSizeKb = options?.maxSizeKb ?? compression.targetSizeKb;

    // Normalize EXIF orientation even when no compression is necessary — the dimensions written to
    // the row come from here, and an orientation-6 portrait reports them swapped.
    //
    // Guarded, because `.toBuffer()` always runs the pipeline and re-encodes at sharp's default
    // quality, and this branch exists to hand back an image it was asked not to touch. Orientation
    // 1, or none at all, is every image that never passed through a phone camera: `.rotate()` is a
    // no-op on those, so the re-encode would be pure quality loss.
    const needsRotation = (metadata.orientation ?? 1) > 1;
    const normalizedBuffer = needsRotation ? await sharp(buffer).rotate().toBuffer() : buffer;
    const normalizedMetadata = needsRotation ? await sharp(normalizedBuffer).metadata() : metadata;
    const normalizedSizeKb = toKb(normalizedBuffer.length);

    if (normalizedSizeKb < maxSizeKb) {
      return {
        width: normalizedMetadata.width ?? width,
        height: normalizedMetadata.height ?? height,
        metadata: normalizedMetadata,
        buffer: normalizedBuffer,
        mimeType: `image/${normalizedMetadata.format ?? metadata.format}`,
        size: normalizedBuffer.length,
      };
    }
  }

  const mimeType = options?.format === "png" ? "image/png" : "image/webp";
  let compressedImage = await compressImage(buffer, { mimeType, quality: compression.initialQuality });

  let tries = 5;
  let compressionQuality = compression.initialQuality;

  while (tries > 0) {
    if (toKb(compressedImage.buffer.length) < compression.targetSizeKb)
      return compressedImage;

    compressionQuality = Math.max(1, compressionQuality - 3);
    compressedImage = await compressImage(buffer, { mimeType, quality: compressionQuality });
    tries--;
  }

  return compressedImage;
};
