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
import type { PortableRecipe } from "@convex/schema/recipePayloads";

import { imageFileNameOf, slugOf } from "../../_lib/folders";
import { openZip, zipNameOf, zipOf } from "../../_lib/zip";

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
 * The folder a recipe is written to: its title as a slug (`slugOf`). "Tarte aux pommes" becomes
 * `tarte-aux-pommes`.
 *
 * Two recipes can share a title, so the caller keeps the folders apart with `uniqueFolder`.
 */
export const folderOf = (recipe: PortableRecipe): string =>
  slugOf(recipe.row.title.values.fr ?? recipe.row.title.values.en ?? "recipe") || "recipe";

/** The file name of image `role`: `plate-base.webp`, the extension read from its URL. */
export const imageFileOf = (role: ImageRole, url: string): string => imageFileNameOf(role, url);

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
 * path `localizeImages` gave it (`zipOf`).
 */
export const packArchive = (
  manifest: CatalogManifest,
  recipes: Record<string, PortableRecipe>,
  images: Record<string, Uint8Array>,
): Uint8Array => {
  const json: Record<string, unknown> = { [MANIFEST_FILE]: manifest };
  for (const [folder, recipe] of Object.entries(recipes)) json[`${folder}/${RECIPE_FILE}`] = recipe;

  return zipOf(json, images);
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
 * A folder the manifest names with no `recipe.json` throws (`openZip`).
 */
export const unpackArchive = (bytes: Uint8Array): { manifest: CatalogManifest; recipes: UnpackedRecipe[] } => {
  const zip = openZip(bytes);

  const manifest = zip.json(MANIFEST_FILE) as Partial<CatalogManifest>;
  if (manifest.version !== 1 || typeof manifest.deployment !== "string" || !Array.isArray(manifest.recipes)) {
    throw new Error(`${MANIFEST_FILE} is not a catalog manifest`);
  }

  const recipes = manifest.recipes.map((folder): UnpackedRecipe => ({
    folder,
    recipe: zip.json(`${folder}/${RECIPE_FILE}`) as PortableRecipe,
    bytesOf: (file) => zip.bytes(`${folder}/${file}`),
  }));

  return { manifest: manifest as CatalogManifest, recipes };
};

/** The zip's file name: `catalog-dev-happy-otter-123-2026-09-21.zip`. */
export const archiveNameOf = (deployment: string, exportedAt: string): string =>
  zipNameOf("catalog", deployment, exportedAt);
