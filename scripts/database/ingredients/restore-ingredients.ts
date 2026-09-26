/**
 * `pnpm ingredients:restore <zip>` — an `ingredients:export` zip into this deployment.
 *
 * For each ingredient in the zip, hands it to `restoreOne._internal` with its image files. The
 * server creates what the deployment lacks, attaches the exported image to a row that has none, and
 * leaves every other row as it is, so a restore after a seed fills in the images and a second run
 * changes nothing. No model is called. An ingredient that fails is reported and the run goes on.
 */
import { readFileSync } from "node:fs";

import { internal } from "@convex/_generated/api";
import type { RestoredIngredientImage } from "@convex/schema/ingredientPayloads";

import { connectAdmin } from "../_lib/convexAdmin";
import { type UnpackedIngredient, unpackArchive } from "./_lib/archive";

/**
 * The image files, base64, for `restoreOne` to upload. Both or nothing: a file missing from the zip
 * is warned about, and the ingredient is restored without an image.
 */
const _imageOf = ({ folder, ingredient, bytesOf }: UnpackedIngredient): RestoredIngredientImage => {
  if (!ingredient.image) return undefined;

  try {
    const base64 = (file: string) => Buffer.from(bytesOf(file)).toString("base64");

    return { image: base64(ingredient.image.url), base: base64(ingredient.image.base.url) };
  } catch (error) {
    console.warn(`  ! ${folder}/ image unreadable, restored without it (${(error as Error).message})`);

    return undefined;
  }
};

const main = async () => {
  const zip = process.argv[2];
  if (!zip) throw new Error("Usage: pnpm ingredients:restore <zip>");

  const admin = connectAdmin();
  const { manifest, ingredients } = unpackArchive(new Uint8Array(readFileSync(zip)));
  const run = { created: 0, imageAdded: 0, existing: 0, failed: 0 };

  console.log(
    `Restoring ${ingredients.length} ingredient(s) exported from ${manifest.deployment} into ${admin.deployment}.`,
  );

  for (const unpacked of ingredients) {
    try {
      const { outcome } = await admin.action(internal.router.ingredients.restoreOne._internal, {
        ingredient: unpacked.ingredient,
        image: _imageOf(unpacked),
      });
      run[outcome]++;
      if (outcome !== "existing") console.log(`  ${outcome === "created" ? "restored" : "image added to"} ${unpacked.folder}/`);
    } catch (error) {
      // One ingredient that fails does not stop the zip: the rest land, and a re-run retries it.
      run.failed++;
      console.error(`  ✗ ${unpacked.folder}/ failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(
    `\n${run.created} restored, ${run.imageAdded} given their image, ${run.existing} already complete, ${run.failed} failed.`,
  );
  if (run.failed) process.exitCode = 1;
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
