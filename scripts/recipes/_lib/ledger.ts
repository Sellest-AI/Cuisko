/**
 * The catalog ledger: every dish searched and every Marmiton card seen, and where each import landed.
 *
 * It is the first of two duplicate guards, and the cheap one: it saves a search, a fetch and a model
 * call. The second is on the server (`importOne` checks the catalog's `sourceUrl`), so a lost or
 * stale ledger can waste work but can never duplicate a recipe.
 *
 * Committed, because it is also the only record of what was rejected and what failed, and that
 * record should survive a change of machine.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import * as z from "zod/v4";

import { CUISINES } from "@shared/cuisines";
import { VEGETARIAN_DIETS } from "@shared/diets";

const _importSchema = z.object({
  /** Where it landed, as read from the deploy key: "dev:happy-otter-123". */
  deployment: z.string().min(1),
  recipeId: z.string().min(1),
  at: z.string(),
});

const _recipeSchema = z.object({
  /** The dish name whose search found it, a key of `dishes`. */
  dish: z.string(),
  title: z.string(),
  /** Marmiton's rating out of 5, at the time the card was seen. */
  rating: z.number(),
  /** Marmiton's "avis" count, at the time the card was seen. */
  reviews: z.number().int().nonnegative(),
  /**
   * What is known about the RECIPE, and never where it landed: that is `imports` (see `pendingFor`).
   *
   * "rejected" failed the bar. "skipped" cleared it but was not its search's best card (`bestCard`):
   * one search contributes one recipe. The two stay apart so that a change to the bar, or to the
   * one-per-search rule, can be re-applied to the ledger without fetching a page again.
   */
  status: z.enum(["accepted", "rejected", "skipped", "imported", "failed"]),
  error: z.string().optional(),
  /** One entry per deployment, so a dev id and a prod id never overwrite each other. */
  imports: z.array(_importSchema),
});

const _ledgerSchema = z.object({
  version: z.literal(1),
  /** Index into `CUISINES` of the next cuisine to ask dishes for; the run goes round-robin. */
  cuisineCursor: z.number().int().nonnegative(),
  /** Every dish name ever searched, so the agent can be told to avoid it. */
  dishes: z.record(
    z.string(),
    z.object({
      cuisine: z.enum(CUISINES),
      /** What the agent intended; the real facets are computed at import. */
      diet: z.enum(VEGETARIAN_DIETS).optional(),
      searchedAt: z.string(),
    }),
  ),
  /**
   * Keyed by canonical URL (`canonicalUrlOf`), the spelling the server stores as `sourceUrl`.
   * Insertion order is kept by JSON and by this schema, and it is the order imports run in.
   */
  recipes: z.record(z.string(), _recipeSchema),
});

export type Ledger = z.infer<typeof _ledgerSchema>;
export type LedgerRecipe = z.infer<typeof _recipeSchema>;

export const emptyLedger = (): Ledger => ({ version: 1, cuisineCursor: 0, dishes: {}, recipes: {} });

/**
 * The ledger at `file`, or an empty one if the file does not exist yet.
 *
 * Validated rather than cast: the file is committed and can be edited by hand or merged, and a
 * malformed entry found halfway through a run would be found after the run had spent money.
 */
export const readLedger = (file: string): Ledger => {
  if (!existsSync(file)) return emptyLedger();

  const parsed = _ledgerSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) {
    throw new Error(`${file} is not a valid catalog ledger:\n${z.prettifyError(parsed.error)}`);
  }

  return parsed.data;
};

/**
 * Writes the ledger to `file`.
 *
 * Through a temporary file and a rename, because the script writes after every recipe, and an
 * interruption while the file is being written would otherwise leave a truncated ledger in place.
 */
export const writeLedger = (file: string, ledger: Ledger): void => {
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(ledger, null, 2)}\n`);
  renameSync(temporary, file);
};

/**
 * The URLs still to import on `deployment`, in ledger order.
 *
 * Read from `imports`, not from `status` alone: a recipe imported on dev has status "imported" and
 * is still pending for prod. A "failed" recipe is never pending, on any deployment. It stays in the
 * ledger with its error, and a re-run moves on to other recipes.
 */
export const pendingFor = (ledger: Ledger, deployment: string): string[] =>
  Object.entries(ledger.recipes)
    .filter(
      ([, recipe]) =>
        (recipe.status === "accepted" || recipe.status === "imported") &&
        !recipe.imports.some((landed) => landed.deployment === deployment),
    )
    .map(([url]) => url);
