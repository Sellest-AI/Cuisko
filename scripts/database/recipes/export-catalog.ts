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

import type { PaginationResult } from "convex/server";

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
import { connectAdmin } from "../_lib/convexAdmin";
import { uniqueFolder } from "../_lib/folders";
import { downloadImage } from "../_lib/downloadImage";

const PAGE_SIZE = 20;

const main = async () => {
  const admin = connectAdmin();
  const directory = process.argv[2] ?? process.cwd();
  const exportedAt = new Date().toISOString();

  const recipes: Record<string, PortableRecipe> = {};
  const images: Record<string, Uint8Array> = {};

  console.log(`Exporting the catalog of ${admin.deployment}.`);

  let cursor: string | null = null;
  do {
    // Annotated because `cursor` is assigned from the page and read by the call that fetches it,
    // which TypeScript refuses to infer round.
    const page: PaginationResult<PortableRecipe> = await admin.query(
      internal.router.recipes.exportCatalog._internal,
      { paginationOpts: { cursor, numItems: PAGE_SIZE } },
    );

    for (const exported of page.page) {
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
      console.log(`  ${folder}/ · ${kept.size} image(s)`);
    }

    cursor = page.isDone ? null : page.continueCursor;
  } while (cursor);

  const folders = Object.keys(recipes);
  const zip = path.join(directory, archiveNameOf(admin.deployment, exportedAt));
  writeFileSync(zip, packArchive({ version: 1, deployment: admin.deployment, exportedAt, recipes: folders }, recipes, images));

  console.log(`\n${folders.length} recipe(s), ${Object.keys(images).length} image(s) → ${zip}`);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
