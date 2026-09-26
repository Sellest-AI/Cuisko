/**
 * The ingredients zip: one folder per ingredient, and a manifest at the root.
 *
 * ```
 * ingredients.json              deployment, date, and the folder of every ingredient
 * carotte/ingredient.json       the ingredient as `exportCatalog` returned it
 * carotte/image.png             the cut-out the app shows
 * carotte/image-base.webp       the render it was cut from
 * ```
 *
 * The same layout as the recipe catalog's (`scripts/database/recipes/_lib/archive.ts`): an ingredient and
 * its image sit together, and inside `ingredient.json` each image `url` is the file's name in the
 * same folder, so the restore reads the bytes from beside it.
 */
import type { PortableIngredient } from "@convex/schema/ingredientPayloads";

import { imageFileNameOf, slugOf } from "../../_lib/folders";
import { openZip, zipNameOf, zipOf } from "../../_lib/zip";

export const MANIFEST_FILE = "ingredients.json";
export const INGREDIENT_FILE = "ingredient.json";

export type IngredientsManifest = {
  version: 1;
  /** The deployment the ingredients came from, as the deploy key names it ("dev:happy-otter-123"). */
  deployment: string;
  exportedAt: string;
  /** The folder of every ingredient, in export order. */
  ingredients: string[];
};

/** One image to fetch from `url` and store at `file` inside the zip. */
export type ImageFile = { file: string; url: string };

/**
 * The folder an ingredient is written to: its slug when the seed gave it one, else its name as a
 * slug. Two rows can share a name, so the caller keeps the folders apart with `uniqueFolder`.
 */
export const folderOf = ({ row }: PortableIngredient): string =>
  slugOf(row.slug ?? row.name.values.fr ?? row.name.values.en ?? "") || "ingredient";

/**
 * The ingredient with its image URLs rewritten to their file names in `folder`, and the downloads
 * that fill those files, each at its path inside the zip.
 */
export const localizeImage = (
  ingredient: PortableIngredient,
  folder: string,
): { ingredient: PortableIngredient; files: ImageFile[] } => {
  const { image } = ingredient;
  if (!image) return { ingredient, files: [] };

  const url = imageFileNameOf("image", image.url);
  const baseUrl = imageFileNameOf("image-base", image.base.url);

  return {
    ingredient: { ...ingredient, image: { ...image, url, base: { url: baseUrl } } },
    files: [
      { file: `${folder}/${url}`, url: image.url },
      { file: `${folder}/${baseUrl}`, url: image.base.url },
    ],
  };
};

/** The zip bytes: the manifest, each `ingredient.json` in its folder, and every image file. */
export const packArchive = (
  manifest: IngredientsManifest,
  ingredients: Record<string, PortableIngredient>,
  images: Record<string, Uint8Array>,
): Uint8Array => {
  const json: Record<string, unknown> = { [MANIFEST_FILE]: manifest };
  for (const [folder, ingredient] of Object.entries(ingredients)) json[`${folder}/${INGREDIENT_FILE}`] = ingredient;

  return zipOf(json, images);
};

export type UnpackedIngredient = {
  folder: string;
  ingredient: PortableIngredient;
  /** The bytes of an image file named in `ingredient.image`, relative to the folder. */
  bytesOf: (file: string) => Uint8Array;
};

/**
 * A zip `packArchive` wrote, read back: the manifest, and each ingredient it lists with a way to
 * its image bytes.
 *
 * The manifest is checked for shape, because it decides what is read. The ingredients are not: the
 * server validates each against `vPortableIngredient` on the way in, and refuses one edited by hand
 * into something else there, by name.
 */
export const unpackArchive = (
  bytes: Uint8Array,
): { manifest: IngredientsManifest; ingredients: UnpackedIngredient[] } => {
  const zip = openZip(bytes);

  const manifest = zip.json(MANIFEST_FILE) as Partial<IngredientsManifest>;
  if (manifest.version !== 1 || typeof manifest.deployment !== "string" || !Array.isArray(manifest.ingredients)) {
    throw new Error(`${MANIFEST_FILE} is not an ingredients manifest`);
  }

  const ingredients = manifest.ingredients.map((folder): UnpackedIngredient => ({
    folder,
    ingredient: zip.json(`${folder}/${INGREDIENT_FILE}`) as PortableIngredient,
    bytesOf: (file) => zip.bytes(`${folder}/${file}`),
  }));

  return { manifest: manifest as IngredientsManifest, ingredients };
};

/** The zip's file name: `ingredients-dev-happy-otter-123-2026-09-21.zip`. */
export const archiveNameOf = (deployment: string, exportedAt: string): string =>
  zipNameOf("ingredients", deployment, exportedAt);
