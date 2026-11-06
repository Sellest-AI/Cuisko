import { httpUrlOf } from "@shared/urls";

/**
 * Each address that spells out `http(s)://`, whatever touches it: a space, a line break, a bracket,
 * `Recette:`, `...`. What comes before it must not be a letter or a digit, or `xhttp://` would pass
 * as `http://`. It ends at a blank, a quote or an angle bracket, none of which an address can hold,
 * so the `href="…"` of a copied HTML link comes out whole, and at a `,` or `;` that starts the next
 * link. A link carried inside another (`?u=https://…`) stays in it: no separator precedes it.
 */
const HTTP_LINKS = /(?:^|[^a-z0-9])(https?:\/\/[^\s"<>]+?)(?=$|[\s"<>]|[,;]https?:\/\/)/gi;

/**
 * The first web link the clipboard offers the import screen, sanitized of what was copied around
 * it, or `undefined` when it offers none.
 *
 * The clipboard holds whatever the cook copied last, and they did not copy it for us. `httpUrlOf`
 * reads a field the cook aimed at a web address, so it gives `merci.bien` the benefit of the doubt;
 * here that would turn a copied word into a paste button. So the address has to spell out its
 * scheme, and it is cut out of the text before `httpUrlOf` reads it, because the sentences apps copy
 * around their links do not always leave a space before them. `httpUrlOf` then drops the punctuation
 * stuck to its end.
 */
export const clipboardLinkOf = (text: string): string | undefined => {
  for (const [, link = ""] of text.matchAll(HTTP_LINKS)) {
    const url = httpUrlOf(link);
    if (url) return url;
  }

  return undefined;
};
