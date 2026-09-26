import { paginationOptsValidator } from "convex/server";

import { exportIngredients } from "@convex/functions/ingredients/exportIngredients";
import { internalQuery } from "@convex/procedures";

/**
 * The ingredient catalog a page at a time, in the shape `ingredients:restore` reads, for the
 * `ingredients:export` script through a deploy key.
 *
 * Internal because a page carries every locale and every image URL of its rows: the app reads
 * `getIngredient`, which ships one locale. No cook has a reason to move the catalog between
 * deployments.
 */
export const _internal = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: (ctx, { paginationOpts }) => exportIngredients(ctx, { paginationOpts }),
});
