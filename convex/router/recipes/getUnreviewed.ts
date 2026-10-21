import { listUnreviewedCatalog } from "@convex/functions/recipes/listUnreviewedCatalog";
import { internalQuery } from "@convex/procedures";

/**
 * The catalog recipes still `generated`, for the `catalog:verify` script through a deploy key.
 *
 * Internal because the review queue is an operator's tool: the app's admin verifies one recipe at
 * a time from its screen, and no cook has a reason to list what nobody checked.
 */
export const _internal = internalQuery({
  args: {},
  handler: (ctx) => listUnreviewedCatalog(ctx),
});
