import { v } from "convex/values";

import { mergeIngredient } from "@convex/functions/ingredients/mergeIngredient";
import { internalMutation } from "@convex/procedures";
import { vMergeOutcome } from "@convex/schema/ingredientPayloads";

/**
 * Folds `from` into `to`: every recipe line, cellar, grocery, planned and recent row on `from`
 * moves to `to`, its names become aliases of `to`, and `from` is deleted. See
 * `functions/ingredients/mergeIngredient`.
 *
 * Internal: it rewrites shared recipes, households' stock and the shared catalog, and it is run by
 * hand (`npx convex run router/ingredients/mergeIngredient:_internal`). No cook may call it.
 */
export const _internal = internalMutation({
  args: {
    from: v.id("ingredients"),
    to: v.id("ingredients"),
  },
  returns: vMergeOutcome,
  handler: (ctx, args) => mergeIngredient(ctx, args),
});
