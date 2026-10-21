/**
 * `pnpm catalog:restore <zip>` — a `catalog:export` zip into this deployment's catalog.
 *
 * For each recipe in the zip: skip it when the ledger says it already landed here, or when the
 * catalog already holds its page; otherwise hand it to `restoreOne._internal` with its photo files,
 * and record where it landed. A `reviewed` or `edited` recipe whose page the catalog holds as
 * `generated` is the exception: it replaces that row in place, photos included
 * (`restoreReplaces`). The server uploads the photos, and regenerates any that fails; a recipe
 * that fails is reported and the run goes on. The text arrives in every locale, so nothing
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
import { exportCanUpgrade } from "@convex/functions/recipes/restoreReplaces";
import type { RestoredPhotos } from "@convex/schema/recipePayloads";

import { type UnpackedRecipe, unpackArchive } from "./_lib/archive";
import { connectAdmin } from "../_lib/convexAdmin";
import { scriptTrace } from "../_lib/scriptTrace";
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
  const run = { restored: 0, upgraded: 0, existing: 0, skipped: 0, failed: 0, unmatched: 0 };

  console.log(`Restoring ${recipes.length} recipe(s) exported from ${manifest.deployment} into ${admin.deployment}.`);

  const total = String(recipes.length);
  for (const [index, unpacked] of recipes.entries()) {
    const { folder, recipe } = unpacked;
    // Padded to the total's width, so the folders line up down the run.
    const progress = `[${String(index + 1).padStart(total.length)}/${total}]`;
    const sourceUrl = recipe.row.sourceUrl;
    const known = sourceUrl ? ledger.recipes[sourceUrl] : undefined;
    const landedHere = known?.imports.some((landed) => landed.deployment === admin.deployment) ?? false;

    // `excluded` is the ledger's one hand-written verdict, "not a plate", and it holds on every
    // deployment: `pendingFor` never imports it, and a restore must not either. "Landed here" is not
    // enough for a reviewed or edited recipe: the copy that landed may be the `generated` import
    // this one replaces, which only the server can tell (`restoreReplaces`).
    if (known?.status === "excluded" || (landedHere && !exportCanUpgrade(recipe.row.status))) {
      run.skipped++;
      console.log(`  ${progress} skipped ${folder}/ (${known?.status === "excluded" ? "excluded" : "already restored here"})`);
      continue;
    }
    if (!sourceUrl) console.log(`  ${progress} ! ${folder}/ has no sourceUrl: a second restore would duplicate it`);

    // Asked before sending the photos: a page the catalog holds and keeps costs nothing, and a ledger
    // entry that did not know it landed here (one from another machine) is repaired from the answer.
    let restored: RestoredRecipe;
    try {
      const existing = sourceUrl
        ? await admin.query(internal.router.recipes.restoreOne._internal_find, {
            url: sourceUrl,
            status: recipe.row.status,
          })
        : null;
      restored =
        existing && !existing.replaceable
          ? { recipeId: existing.recipeId, created: false, unmatched: [] }
          : await admin.action(internal.router.recipes.restoreOne._internal, {
            recipe,
            photos: _photosOf(unpacked),
            __trace: scriptTrace("restore/catalog"),
          });
    } catch (error) {
      // One recipe that fails does not stop the zip: the rest land, and a re-run retries this one.
      run.failed++;
      console.error(`  ${progress} ✗ ${folder}/ failed: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const { recipeId, created, replaced, unmatched } = restored;

    // A replace keeps the row, so a deployment the ledger already records is not recorded twice.
    if (sourceUrl && known && !landedHere) {
      recordImport(ledger, sourceUrl, { deployment: admin.deployment, recipeId, at: new Date().toISOString() });
      writeLedger(LEDGER_FILE, ledger);
    }

    if (created) run.restored++;
    else if (replaced) run.upgraded++;
    else run.existing++;
    run.unmatched += unmatched.length;
    console.log(
      `  ${progress} ${created ? "restored" : replaced ? "upgraded" : "already there"} ${folder}/` +
        (unmatched.length ? ` · ${unmatched.length} line(s) unmatched: ${unmatched.join(", ")}` : ""),
    );
  }

  console.log(
    `\n${run.restored} restored, ${run.upgraded} upgraded from generated, ${run.existing} already in the catalog, ` +
      `${run.skipped} skipped by the ledger, ${run.failed} failed, ${run.unmatched} ingredient line(s) dropped.`,
  );
  if (run.failed) process.exitCode = 1;
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
