/**
 * The language a catalog recipe is read in, from the page it was imported from: BBC Good Food in
 * English, Marmiton in French. `seed:catalog` imports by it and `catalog:verify` verifies by it,
 * since the recipe does not record the language it was written in.
 *
 * A host matches itself or a subdomain (`www.marmiton.org`), never a name that merely ends the same
 * way. A new source added to `seed:catalog` belongs in `SOURCE_LOCALES`, or `catalog:verify` reads
 * it in `DEFAULT_LOCALE`.
 */
import type { Locale } from "@convex/schema/i18n";
import { DEFAULT_LOCALE } from "@shared/translations";

const SOURCE_LOCALES: readonly { host: string; locale: Locale }[] = [
  { host: "bbcgoodfood.com", locale: "en" },
  { host: "marmiton.org", locale: "fr" },
];

export const catalogLocaleOf = (sourceUrl: string): Locale => {
  const { hostname } = new URL(sourceUrl);
  return (
    SOURCE_LOCALES.find(({ host }) => hostname === host || hostname.endsWith(`.${host}`))?.locale ?? DEFAULT_LOCALE
  );
};
