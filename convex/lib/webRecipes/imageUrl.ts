/**
 * A recipe page's photo as an address the app may draw, or `undefined`.
 *
 * The page writes its image however it likes: absolute, relative to itself, protocol-relative, or
 * on plain `http:`. The card draws it straight from the page's host (no copy is stored until the
 * recipe is added), so only an absolute `https:` address is kept: iOS refuses to load `http:`
 * images, and a relative one means nothing outside the page. Anything else is absent, and the card
 * draws the placeholder.
 *
 * Edge-safe: `URL` only.
 */
export const httpsImageOf = (raw: string | undefined, pageUrl: string): string | undefined => {
  const written = raw?.trim();
  if (!written) return undefined;

  let image: URL;
  try {
    image = new URL(written, pageUrl);
  } catch (caught) {
    // A malformed address is the page's to have written, not ours to fail the search on.
    if (caught instanceof TypeError) return undefined;
    throw caught;
  }

  return image.protocol === "https:" ? image.href : undefined;
};
