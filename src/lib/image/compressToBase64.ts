import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import { fitLongSide } from "./fitLongSide";

/**
 * The most a photo may weigh, in bytes. The same 200 KB cooture aims at on the phone, under the
 * 300 KB the server's own 1024px tier would settle for, so the server finds nothing left to do.
 */
export const UPLOAD_MAX_BYTES = 200 * 1024;

/**
 * Where quality starts: the server ladder's value for a multi-megabyte input, which is what a
 * camera hands over. It is not read from the file, since a phone photo is always in that range.
 */
const START_QUALITY = 0.88;
const QUALITY_STEP = 0.08;
const MIN_QUALITY = 0.4;

/** Bytes behind a base64 string, padding included. */
const byteLength = (base64: string) => Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);

/**
 * A local photo, shrunk for sending to Cuisko: long side 1024, WebP, base64.
 *
 * **WebP because the server stores WebP.** `compressImageAuto` leaves a WebP that is already under
 * its target untouched; a JPEG would be re-encoded on arrival, losing quality twice for a larger file.
 *
 * Quality drops until the file is under `UPLOAD_MAX_BYTES`, and stops at `MIN_QUALITY` rather than
 * degrading a photo into mush: a file still over the limit is sent as it is, and the server's
 * ceiling is far above it.
 */
export const compressToBase64 = async (uri: string): Promise<string> => {
  const { width, height } = await (await ImageManipulator.manipulate(uri).renderAsync());
  const size = fitLongSide(width, height);

  let quality = START_QUALITY;
  let base64 = "";

  while (true) {
    const context = ImageManipulator.manipulate(uri);
    const image = await (size ? context.resize(size) : context).renderAsync();
    ({ base64 = "" } = await image.saveAsync({ format: SaveFormat.WEBP, compress: quality, base64: true }));

    if (byteLength(base64) <= UPLOAD_MAX_BYTES || quality - QUALITY_STEP < MIN_QUALITY) break;
    quality -= QUALITY_STEP;
  }

  // An encoder that hands back nothing is a failure, not an empty photo: the caller drops the photo
  // and logs, where an empty string would pass for a result and be sent without it.
  if (!base64) throw new Error("The photo could not be encoded");

  return base64;
};
