/**
 * `pnpm catalog:verify [--limit N] [directory]` — the catalog recipes still `generated`, checked
 * against the page they were imported from, `DEFAULT_LIMIT` per run unless `--limit` says otherwise.
 *
 * Each recipe goes through `verifyOne._internal`, the admin's "Verify the recipe": the page is
 * scraped again, the verifier compares, and the recipe ends `reviewed`, rewritten when it was wrong.
 * A recipe is verified in its page's language, the one `seed:catalog` imported it in.
 *
 * The run writes `catalog-verify-<deployment>-<date>.md` to `directory` (the working directory by
 * default): every correction the verifier made, and every recipe that failed, to read before
 * `catalog:export`. A failed recipe stays `generated`, so a re-run retries it.
 *
 * Each verify is a scrape and a model call, and a rewrite adds a resolve and a translation:
 * `--limit` is the spend cap. A verified recipe leaves the queue, so the next run picks up where
 * this one stopped.
 */
import { existsSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { internal } from "@convex/_generated/api";

import { catalogLocaleOf } from "../_lib/catalogLocale";
import { connectAdmin } from "../_lib/convexAdmin";
import { errorMessageOf } from "../_lib/errorMessage";
import { scriptTrace } from "../_lib/scriptTrace";

/** Recipes verified per run when `--limit` is not given: a bare run never spends on the whole catalog. */
const DEFAULT_LIMIT = 16;

/** Verifies at once. Each holds a scrape and a model call open; the sources are asked politely. */
const BATCH_SIZE = 4;

type Rewritten = { title: string; sourceUrl: string; corrections: string[] };
type Failed = { title: string; sourceUrl: string; error: string };

/**
 * `--limit N` and at most one directory, read before anything is spent. A flag it does not know
 * (`--limit=8`) is refused rather than taken for a directory, and the directory is checked here:
 * found missing after the run, it would lose the report of every verify already paid for.
 */
const _argsOf = (args: string[]): { limit: number; directory: string } => {
  let limit = DEFAULT_LIMIT;
  const rest: string[] = [];
  for (let at = 0; at < args.length; at++) {
    const arg = args[at]!;
    if (arg === "--limit") {
      limit = Number(args[++at]);
      if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit takes a whole number above 0");
    } else if (arg.startsWith("--")) throw new Error(`Unknown option ${arg}: the only one is --limit N`);
    else rest.push(arg);
  }
  if (rest.length > 1) throw new Error(`One directory at most, got ${rest.join(", ")}`);

  const directory = rest[0] ?? process.cwd();
  if (!existsSync(directory) || !statSync(directory).isDirectory())
    throw new Error(`${directory} is not a directory: the report would have nowhere to go`);
  return { limit, directory };
};

const _report = (deployment: string, run: { unchanged: number; rewritten: Rewritten[]; failed: Failed[] }) =>
  [
    `# Catalog verify · ${deployment}`,
    "",
    `${run.unchanged} unchanged · ${run.rewritten.length} rewritten · ${run.failed.length} failed`,
    "",
    "## Rewritten",
    "",
    ...run.rewritten.flatMap(({ title, sourceUrl, corrections }) => [
      `### ${title}`,
      "",
      sourceUrl,
      "",
      ...corrections.map((correction) => `- ${correction}`),
      "",
    ]),
    "## Failed",
    "",
    ...run.failed.map(({ title, sourceUrl, error }) => `- **${title}** (${sourceUrl}): ${error}`),
    "",
  ].join("\n");

const main = async () => {
  const { limit, directory } = _argsOf(process.argv.slice(2));
  const admin = connectAdmin();

  const queue = await admin.query(internal.router.recipes.getUnreviewed._internal, {});
  const recipes = queue.slice(0, limit);
  console.log(`${queue.length} catalog recipe(s) not yet reviewed on ${admin.deployment}; verifying ${recipes.length}.`);

  const run = { unchanged: 0, rewritten: [] as Rewritten[], failed: [] as Failed[] };

  const verifyOne = async ({ recipeId, sourceUrl, title }: (typeof recipes)[number], position: number) => {
    const label = `[${position}/${recipes.length}] ${title}`;
    try {
      const outcome = await admin.action(internal.router.recipes.verifyOne._internal, {
        recipeId,
        locale: catalogLocaleOf(sourceUrl),
        __trace: scriptTrace("verify/catalog"),
      });
      if (outcome.verdict === "unchanged") {
        run.unchanged++;
        console.log(`  ${label}: unchanged`);
      } else {
        run.rewritten.push({ title, sourceUrl, corrections: outcome.corrections });
        console.log(`  ${label}: rewritten, ${outcome.corrections.length} correction(s)`);
        for (const correction of outcome.corrections) console.log(`      - ${correction}`);
      }
    } catch (error) {
      const message = errorMessageOf(error);
      run.failed.push({ title, sourceUrl, error: message });
      console.log(`  ${label}: failed: ${message}`);
    }
  };

  for (let offset = 0; offset < recipes.length; offset += BATCH_SIZE) {
    const batch = recipes.slice(offset, offset + BATCH_SIZE);
    await Promise.all(batch.map((recipe, index) => verifyOne(recipe, offset + index + 1)));
  }

  const file = path.join(
    directory,
    `catalog-verify-${admin.deployment.replace(":", "-")}-${new Date().toISOString().slice(0, 10)}.md`,
  );
  writeFileSync(file, _report(admin.deployment, run));

  console.log(
    `\n${run.unchanged} unchanged · ${run.rewritten.length} rewritten · ${run.failed.length} failed → ${file}`,
  );
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
