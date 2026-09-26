/**
 * The names an export zip gives its folders and files, shared by the recipe and the ingredient
 * archives so both read alike when opened by hand.
 */
import path from "node:path";

/**
 * `text` as a folder name: lower-cased, accents folded, anything but letters and digits turned
 * into one dash. "Tarte aux pommes" becomes `tarte-aux-pommes`; text with nothing left is `""`.
 *
 * The two ligatures French uses are spelled out first: NFD leaves them whole, so "bœuf" would
 * otherwise lose its vowel.
 */
export const slugOf = (text: string): string =>
  text
    .replace(/œ/gi, "oe")
    .replace(/æ/gi, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** `folder`, or `folder-2`, `folder-3`… when `taken` already holds it. */
export const uniqueFolder = (folder: string, taken: ReadonlySet<string>): string => {
  if (!taken.has(folder)) return folder;

  let n = 2;
  while (taken.has(`${folder}-${n}`)) n++;

  return `${folder}-${n}`;
};

/**
 * The file name an image downloaded from `url` is stored under: `stem` plus the source file's
 * extension, read from its URL, so the file opens on the computer it is extracted to. A URL with
 * none gets none; a restore uploads bytes, and the upload reads the format from them, not from
 * the name.
 */
export const imageFileNameOf = (stem: string, url: string): string =>
  `${stem}${path.posix.extname(new URL(url).pathname)}`;
