import sharp from "sharp";

/**
 * @param imageBuffer the image buffer
 * @param precision **0 - 100**, 100 requiring more transparent pixels than 0, default 100
 * @returns true if the image has transparent pixels, false otherwise
 */
export const hasImageAlpha = async (imageBuffer: Buffer, precision = 100): Promise<boolean> => {
  try {
    const metadata = await sharp(imageBuffer).metadata();

    // If the image doesn't have an alpha channel, return false
    if ((metadata.channels ?? 3) < 4) {
      return false;
    }

    // Get stats for the alpha channel
    const stats = await sharp(imageBuffer).stats();

    // Check if there are any pixels with alpha < threshold
    // Adjust threshold based on precision (similar to client-side logic)
    const threshold = 255 - 30 - precision;
    const hasAlpha = (stats.channels[3]?.min ?? 255) < threshold; // Alpha is channel 3 (0-based: R=0, G=1, B=2, A=3)
    return hasAlpha; // Alpha is channel 3 (0-based: R=0, G=1, B=2, A=3)
  } catch (error) {
    throw new Error(`Failed to check image alpha: ${error}`);
  }
};
