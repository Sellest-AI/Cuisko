/**
 * `pnpm catalog:restore <zip>` — a `catalog:export` zip into this deployment's catalog.
 *
 * For each recipe in the zip: skip it when the ledger says it already landed here, or when the
 * catalog already holds its page; otherwise hand it to `restoreOne._internal` with its photo files,
 * and record where it landed. The server uploads the photos, and regenerates any that fails; a
 * recipe that fails is reported and the run goes on. The text arrives in every locale, so nothing
 * is translated; the ingredient lines go through the same resolver a created recipe's do, which may
 * call a model for a food this catalog has never held.
 *
 * Two duplicate guards, independent. The ledger is the cheap one. The catalog's `sourceUrl` is the
 * server's, asked before anything is sent, and it holds when the ledger is lost. A recipe
 * exported with no `sourceUrl` has neither, and is said so.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { internal } from "@convex/_generated/api";
import type { RestoredRecipe } from "@convex/functions/recipes/restoreRecipe";
import type { RestoredPhotos } from "@convex/schema/recipePayloads";

import { type UnpackedRecipe, unpackArchive } from "./_lib/archive";
import { connectAdmin } from "../_lib/convexAdmin";
import { readLedger, recordImport, writeLedger } from "./_lib/ledger";

const LEDGER_FILE = path.join(__dirname, "catalog.ledger.json");

/**
 * The recipe's photo files, base64, for `restoreOne` to upload. A file missing from the zip is left
 * out with a warning: the server restores the recipe without that photo and regenerates it.
 */
const _photosOf = ({ folder, recipe, bytesOf }: UnpackedRecipe): RestoredPhotos => {
  const { cover, plate } = recipe.images;
  const base64 = (file: string | undefined) => {
    if (!file) return undefined;
    try {
      return Buffer.from(bytesOf(file)).toString("base64");
    } catch (error) {
      console.warn(`  ! ${folder}/${file} unreadable, restored without it (${(error as Error).message})`);

      return undefined;
    }
  };

  return { cover: base64(cover?.url), plate: base64(plate?.url), plateBase: base64(plate?.base.url) };
};

const main = async () => {
  const zip = process.argv[2];
  if (!zip) throw new Error("Usage: pnpm catalog:restore <zip>");

  const admin = connectAdmin();
  const ledger = readLedger(LEDGER_FILE);
  const { manifest, recipes } = unpackArchive(new Uint8Array(readFileSync(zip)));
  const run = { restored: 0, existing: 0, skipped: 0, failed: 0, unmatched: 0 };

  console.log(`Restoring ${recipes.length} recipe(s) exported from ${manifest.deployment} into ${admin.deployment}.`);

  for (const unpacked of recipes) {
    const { folder, recipe } = unpacked;
    const sourceUrl = recipe.row.sourceUrl;
    const known = sourceUrl ? ledger.recipes[sourceUrl] : undefined;

    // `excluded` is the ledger's one hand-written verdict, "not a plate", and it holds on every
    // deployment: `pendingFor` never imports it, and a restore must not either.
    if (known?.status === "excluded" || known?.imports.some((landed) => landed.deployment === admin.deployment)) {
      run.skipped++;
      continue;
    }
    if (!sourceUrl) console.log(`  ! ${folder}/ has no sourceUrl: a second restore would duplicate it`);

    // Asked before sending the photos: a page the catalog holds costs nothing, and a ledger entry
    // that did not know it landed here (one from another machine) is repaired from the answer.
    let restored: RestoredRecipe;
    try {
      const existingId = sourceUrl
        ? await admin.query(internal.router.recipes.importOne._internal_find, { url: sourceUrl })
        : null;
      restored = existingId
        ? { recipeId: existingId, created: false, unmatched: [] }
        : await admin.action(internal.router.recipes.restoreOne._internal, { recipe, photos: _photosOf(unpacked) });
    } catch (error) {
      // One recipe that fails does not stop the zip: the rest land, and a re-run retries this one.
      run.failed++;
      console.error(`  ✗ ${folder}/ failed: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const { recipeId, created, unmatched } = restored;

    if (sourceUrl && known) {
      recordImport(ledger, sourceUrl, { deployment: admin.deployment, recipeId, at: new Date().toISOString() });
      writeLedger(LEDGER_FILE, ledger);
    }

    if (created) run.restored++;
    else run.existing++;
    run.unmatched += unmatched.length;
    console.log(
      `  ${created ? "restored" : "already there"} ${folder}/` +
        (unmatched.length ? ` · ${unmatched.length} line(s) unmatched: ${unmatched.join(", ")}` : ""),
    );
  }

  console.log(
    `\n${run.restored} restored, ${run.existing} already in the catalog, ${run.skipped} skipped by the ledger, ` +
      `${run.failed} failed, ${run.unmatched} ingredient line(s) dropped.`,
  );
  if (run.failed) process.exitCode = 1;
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
