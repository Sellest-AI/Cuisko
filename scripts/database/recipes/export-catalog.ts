/**
 * `pnpm catalog:export [directory]` — the catalog of one deployment as a zip.
 *
 * Reads the catalog a page at a time through a deploy key, downloads every image, and writes
 * `catalog-<deployment>-<date>.zip` to `directory` (the working directory by default). The zip is
 * what `catalog:restore` reads on another deployment; see `_lib/archive.ts` for its layout.
 *
 * Nothing is written on the server, and no model is called: an export is a read.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { internal } from "@convex/_generated/api";
import type { PortableRecipe } from "@convex/schema/recipePayloads";

import {
  archiveNameOf,
  folderOf,
  imageFilesOf,
  localizeImages,
  packArchive,
  withoutImages,
} from "./_lib/archive";
import { catalogPagesOf } from "./_lib/catalogPages";
import { connectAdmin } from "../_lib/convexAdmin";
import { uniqueFolder } from "../_lib/folders";
import { downloadImage } from "../_lib/downloadImage";

const main = async () => {
  const admin = connectAdmin();
  const directory = process.argv[2] ?? process.cwd();
  const exportedAt = new Date().toISOString();

  const recipes: Record<string, PortableRecipe> = {};
  const images: Record<string, Uint8Array> = {};

  console.log(`Exporting the catalog of ${admin.deployment}.`);

  const pages = catalogPagesOf((paginationOpts) =>
    admin.query(internal.router.recipes.exportCatalog._internal, { paginationOpts }),
  );
  for await (const page of pages) {
    for (const exported of page) {
      const folder = uniqueFolder(folderOf(exported), new Set(Object.keys(recipes)));
      const { recipe, files } = localizeImages(exported, folder);
      const missing: string[] = [];
      for (const file of files) {
        const bytes = await downloadImage(file.url, (message) => console.warn(`  ! ${message}`));
        if (bytes) images[file.file] = bytes;
        else missing.push(file.file);
      }
      recipes[folder] = missing.length ? withoutImages(recipe, missing) : recipe;
      // A plate whose base is gone is dropped whole, so its cut-out, downloaded, must go too.
      const kept = new Set(imageFilesOf(recipes[folder], folder));
      for (const file of files) if (!kept.has(file.file)) delete images[file.file];
      // @limitation No total: the catalog is read a page at a time, and nothing counts it up front.
      console.log(`  [${Object.keys(recipes).length}] ${folder}/ · ${kept.size} image(s)`);
    }
  }

  const folders = Object.keys(recipes);
  const zip = path.join(directory, archiveNameOf(admin.deployment, exportedAt));
  writeFileSync(zip, packArchive({ version: 1, deployment: admin.deployment, exportedAt, recipes: folders }, recipes, images));

  console.log(`\n${folders.length} recipe(s), ${Object.keys(images).length} image(s) → ${zip}`);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
