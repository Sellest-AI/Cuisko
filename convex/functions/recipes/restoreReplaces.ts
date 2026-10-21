import type { RecipeStatus } from "@convex/schema/recipes";

/**
 * Whether a restore overwrites the catalog's copy of a page with the zip's copy of the same page.
 *
 * Only a copy nobody checked gives way, and only to one somebody did: a `generated` row here for a
 * `reviewed` or `edited` export. A `reviewed` or `edited` row here is never replaced, by anything,
 * because someone already checked this deployment's copy and the two can differ for good reasons.
 * An export from before the status column (`undefined`) is `generated`, as the restore reads it.
 */
export const restoreReplaces = (existing: RecipeStatus, exported: RecipeStatus | undefined): boolean =>
  existing === "generated" && exportCanUpgrade(exported);

/**
 * Whether an exported recipe could replace ANY copy of its page — for a caller that does not know
 * the copy here yet, as the script deciding whether the ledger's "landed here" settles it.
 */
export const exportCanUpgrade = (exported: RecipeStatus | undefined): boolean =>
  exported === "reviewed" || exported === "edited";
