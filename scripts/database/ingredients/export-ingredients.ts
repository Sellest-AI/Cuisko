/**
 * `pnpm ingredients:export [directory]` — the ingredient catalog of one deployment as a zip.
 *
 * Reads the catalog a page at a time through a deploy key, downloads every image pair, and writes
 * `ingredients-<deployment>-<date>.zip` to `directory` (the working directory by default). The zip
 * is what `ingredients:restore` reads on another deployment; see `_lib/archive.ts` for its layout.
 *
 * Nothing is written on the server, and no model is called: an export is a read.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import type { PaginationResult } from "convex/server";

import { internal } from "@convex/_generated/api";
import type { PortableIngredient } from "@convex/schema/ingredientPayloads";

import { connectAdmin } from "../_lib/convexAdmin";
import { downloadImage } from "../_lib/downloadImage";
import { uniqueFolder } from "../_lib/folders";
import { archiveNameOf, folderOf, localizeImage, packArchive } from "./_lib/archive";

const PAGE_SIZE = 100;

const main = async () => {
  const admin = connectAdmin();
  const directory = process.argv[2] ?? process.cwd();
  const exportedAt = new Date().toISOString();

  const ingredients: Record<string, PortableIngredient> = {};
  const images: Record<string, Uint8Array> = {};

  console.log(`Exporting the ingredients of ${admin.deployment}.`);

  let cursor: string | null = null;
  do {
    // Annotated because `cursor` is assigned from the page and read by the call that fetches it,
    // which TypeScript refuses to infer round.
    const page: PaginationResult<PortableIngredient> = await admin.query(
      internal.router.ingredients.exportCatalog._internal,
      { paginationOpts: { cursor, numItems: PAGE_SIZE } },
    );

    for (const exported of page.page) {
      const folder = uniqueFolder(folderOf(exported), new Set(Object.keys(ingredients)));
      const { ingredient, files } = localizeImage(exported, folder);

      const downloaded: Record<string, Uint8Array> = {};
      for (const file of files) {
        const bytes = await downloadImage(file.url, (message) => console.warn(`  ! ${message}`));
        if (bytes) downloaded[file.file] = bytes;
      }
      // The pair is kept whole or not at all: the restore uploads the cut-out as an object on its
      // base, so one without the other is no image.
      const whole = files.every((file) => downloaded[file.file]);
      ingredients[folder] = whole ? ingredient : { ...ingredient, image: undefined };
      if (whole) Object.assign(images, downloaded);
    }
    console.log(`  ${Object.keys(ingredients).length} ingredient(s)…`);

    cursor = page.isDone ? null : page.continueCursor;
  } while (cursor);

  const folders = Object.keys(ingredients);
  const withImage = folders.filter((folder) => ingredients[folder]?.image).length;
  const zip = path.join(directory, archiveNameOf(admin.deployment, exportedAt));
  writeFileSync(
    zip,
    packArchive({ version: 1, deployment: admin.deployment, exportedAt, ingredients: folders }, ingredients, images),
  );

  console.log(`\n${folders.length} ingredient(s), ${withImage} with an image → ${zip}`);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
