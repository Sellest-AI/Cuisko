import { paginationOptsValidator } from "convex/server";

import { exportCatalog } from "@convex/functions/recipes/exportCatalog";
import { internalQuery } from "@convex/procedures";

/**
 * The catalog a page at a time, in the shape `catalog:restore` reads, for the `catalog:export`
 * script through a deploy key.
 *
 * Internal because a page carries every locale, every ingredient and every image URL of twenty
 * recipes: the app's screens read `getMany`, which ships one locale and a card. No cook has a
 * reason to move the catalog between deployments.
 */
export const _internal = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: (ctx, { paginationOpts }) => exportCatalog(ctx, { paginationOpts }),
});
