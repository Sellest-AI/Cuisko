/**
 * The catalog zip: one folder per recipe, and a manifest at the root.
 *
 * ```
 * catalog.json                       deployment, date, and the folder of every recipe
 * tarte-aux-pommes/recipe.json       the recipe as `exportCatalog` returned it
 * tarte-aux-pommes/cover.webp
 * tarte-aux-pommes/plate.png
 * tarte-aux-pommes/plate-base.webp
 * ```
 *
 * A recipe and its photos sit together, so one recipe can be opened, checked or removed by hand
 * before a restore. Inside `recipe.json` each image `url` is the file's name in the same folder
 * rather than the exporting deployment's URL: the restore reads the bytes from beside the recipe,
 * and they do not die with the source bucket.
 */
import path from "node:path";

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import type { PortableRecipe } from "@convex/schema/recipePayloads";

export const MANIFEST_FILE = "catalog.json";
export const RECIPE_FILE = "recipe.json";

export type CatalogManifest = {
  version: 1;
  /** The deployment the recipes came from, as the deploy key names it ("dev:happy-otter-123"). */
  deployment: string;
  exportedAt: string;
  /** The folder of every recipe, in export order. */
  recipes: string[];
};

/** One image to fetch from `url` and store at `file` inside the zip. */
export type ImageFile = { file: string; url: string };

type ImageRole = "cover" | "plate" | "plate-base";

/**
 * The folder a recipe is written to: its title, lower-cased, accents folded, anything but letters
 * and digits turned into one dash. "Tarte aux pommes" becomes `tarte-aux-pommes`.
 *
 * The two ligatures French titles use are spelled out first: NFD leaves them whole, so "bœuf"
 * would otherwise lose its vowel.
 *
 * Two recipes can share a title, so the caller keeps the folders apart with `uniqueFolder`.
 */
export const folderOf = (recipe: PortableRecipe): string => {
  const title = recipe.row.title.values.fr ?? recipe.row.title.values.en ?? "recipe";
  const slug = title
    .replace(/œ/gi, "oe")
    .replace(/æ/gi, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || "recipe";
};

/** `folder`, or `folder-2`, `folder-3`… when `taken` already holds it. */
export const uniqueFolder = (folder: string, taken: ReadonlySet<string>): string => {
  if (!taken.has(folder)) return folder;

  let n = 2;
  while (taken.has(`${folder}-${n}`)) n++;

  return `${folder}-${n}`;
};

/**
 * The file name of image `role`: `plate-base.webp`.
 *
 * The extension is the source file's, read from its URL, so the file opens on the computer it is
 * extracted to. A URL with none gets none; the restore uploads bytes, and the upload reads the
 * format from them, not from the name.
 */
export const imageFileOf = (role: ImageRole, url: string): string =>
  `${role}${path.posix.extname(new URL(url).pathname)}`;

/**
 * The recipe with every image URL rewritten to its file name in `folder`, and the downloads that
 * fill those files, each at its path inside the zip.
 */
export const localizeImages = (
  recipe: PortableRecipe,
  folder: string,
): { recipe: PortableRecipe; files: ImageFile[] } => {
  const files: ImageFile[] = [];
  const localize = (role: ImageRole, url: string) => {
    const file = imageFileOf(role, url);
    files.push({ file: `${folder}/${file}`, url });

    return file;
  };

  const { cover, plate } = recipe.images;
  const images: PortableRecipe["images"] = {
    cover: cover && { url: localize("cover", cover.url) },
    plate: plate && {
      ...plate,
      url: localize("plate", plate.url),
      base: { url: localize("plate-base", plate.base.url) },
    },
  };

  return { recipe: { ...recipe, images }, files };
};

/**
 * The zip paths of the image files a localized recipe still refers to, under `folder`.
 *
 * Read off the recipe rather than off the download list, so a file downloaded for an image the
 * recipe has since dropped (`withoutImages`) is not among them.
 */
export const imageFilesOf = (recipe: PortableRecipe, folder: string): string[] => {
  const { cover, plate } = recipe.images;

  return [cover?.url, plate?.url, plate?.base.url]
    .filter((file): file is string => !!file)
    .map((file) => `${folder}/${file}`);
};

/**
 * The recipe with every image whose file is in `missing` dropped, `missing` being zip paths as
 * `localizeImages` listed them.
 *
 * A plate is dropped whole when either its cut-out or its base is missing: the restore rebuilds
 * the pair from the base, so half of it is no plate, as `exportCatalog` already treats it.
 */
export const withoutImages = (recipe: PortableRecipe, missing: readonly string[]): PortableRecipe => {
  const gone = (file: string) => missing.some((path) => path.endsWith(`/${file}`));
  const { cover, plate } = recipe.images;

  return {
    ...recipe,
    images: {
      cover: cover && !gone(cover.url) ? cover : undefined,
      plate: plate && !gone(plate.url) && !gone(plate.base.url) ? plate : undefined,
    },
  };
};

/**
 * The zip bytes: the manifest, each recipe's `recipe.json` in its folder, and every image at the
 * path `localizeImages` gave it.
 *
 * Images are stored, not deflated (`level: 0`): they are already compressed, and deflating them
 * again costs time for nothing. The JSON is text, and is.
 */
export const packArchive = (
  manifest: CatalogManifest,
  recipes: Record<string, PortableRecipe>,
  images: Record<string, Uint8Array>,
): Uint8Array => {
  const json = (value: unknown) => strToU8(`${JSON.stringify(value, null, 2)}\n`);
  const entries: Record<string, [Uint8Array, { level: 0 | 6 }]> = {
    [MANIFEST_FILE]: [json(manifest), { level: 6 }],
  };
  for (const [folder, recipe] of Object.entries(recipes)) entries[`${folder}/${RECIPE_FILE}`] = [json(recipe), { level: 6 }];
  for (const [file, bytes] of Object.entries(images)) entries[file] = [bytes, { level: 0 }];

  return zipSync(entries);
};

export type UnpackedRecipe = {
  folder: string;
  recipe: PortableRecipe;
  /** The bytes of an image file named in `recipe.images`, relative to the folder. */
  bytesOf: (file: string) => Uint8Array;
};

/**
 * A zip `packArchive` wrote, read back: the manifest, and each recipe it lists with a way to its
 * image bytes.
 *
 * The manifest is checked for shape, because it decides what is read. The recipes are not: the
 * server validates each one against `vPortableRecipe` on the way in, and a recipe edited by hand
 * into something else is refused there, by name, rather than twice.
 *
 * A folder the manifest names with no `recipe.json` throws: the zip was edited by hand, and a
 * restore should stop rather than restore part of what was asked.
 */
export const unpackArchive = (bytes: Uint8Array): { manifest: CatalogManifest; recipes: UnpackedRecipe[] } => {
  const entries = unzipSync(bytes);
  const json = (file: string): unknown => {
    const entry = entries[file];
    if (!entry) throw new Error(`${file} is not in the zip`);

    return JSON.parse(strFromU8(entry));
  };

  const manifest = json(MANIFEST_FILE) as Partial<CatalogManifest>;
  if (manifest.version !== 1 || typeof manifest.deployment !== "string" || !Array.isArray(manifest.recipes)) {
    throw new Error(`${MANIFEST_FILE} is not a catalog manifest`);
  }

  const recipes = manifest.recipes.map((folder): UnpackedRecipe => ({
    folder,
    recipe: json(`${folder}/${RECIPE_FILE}`) as PortableRecipe,
    bytesOf: (file) => {
      const entry = entries[`${folder}/${file}`];
      if (!entry) throw new Error(`${folder}/${file} is not in the zip`);

      return entry;
    },
  }));

  return { manifest: manifest as CatalogManifest, recipes };
};

/**
 * The zip's file name: `catalog-dev-happy-otter-123-2026-09-21.zip`.
 *
 * The deployment's colon becomes a dash, because a colon is not allowed in a Windows file name.
 */
export const archiveNameOf = (deployment: string, exportedAt: string): string =>
  `catalog-${deployment.replace(":", "-")}-${exportedAt.slice(0, 10)}.zip`;
