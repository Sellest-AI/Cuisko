/**
 * The bytes at `url`, or `undefined` with a warning when they cannot be had: the object is gone from
 * the bucket (an error status), or the request never completed (DNS, a reset connection).
 *
 * Not thrown: the server already exports a recipe whose image row is missing as a recipe with no
 * image, and a row whose object cannot be downloaded is the same case one step later. The recipe
 * is kept, and the restore leaves it without that image, as a recipe is before `generateImages`
 * runs. One throw here would otherwise lose the whole export, zip unwritten.
 */
export const downloadImage = async (
  url: string,
  warn: (message: string) => void,
  fetchUrl: typeof fetch = fetch,
): Promise<Uint8Array | undefined> => {
  try {
    const response = await fetchUrl(url);
    if (!response.ok) {
      warn(`${response.status} downloading ${url}, exported without it`);

      return undefined;
    }

    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    warn(`${error instanceof Error ? error.message : String(error)} downloading ${url}, exported without it`);

    return undefined;
  }
};
