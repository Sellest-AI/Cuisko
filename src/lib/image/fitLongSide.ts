/** The long side of a photo sent to Cuisko, in pixels. Enough to read a shelf, small enough to send. */
export const UPLOAD_LONG_SIDE = 1024;

/**
 * The size to resize to so the long side is `max`, or `undefined` when it already fits.
 *
 * Only one side is given: the other follows the aspect ratio, and a photo is never enlarged.
 * Kept apart from `compressToBase64` because that file loads a native module, which a test cannot.
 */
export const fitLongSide = (width: number, height: number, max: number = UPLOAD_LONG_SIDE) => {
  if (Math.max(width, height) <= max) return undefined;

  return width >= height ? { width: max } : { height: max };
};
