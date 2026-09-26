import { v } from "convex/values";

import { missingIngredientIds } from "@convex/functions/ingredients/missingIngredientIds";
import { internalQuery } from "@convex/procedures";

/**
 * The ids the assistant's showSubstitutions tool was handed that are not a catalog ingredient.
 *
 * Internal only, and `v.string()` rather than `v.id()`, for the reasons `recipes/missingIds.ts`
 * gives.
 */
export const _internal = internalQuery({
  args: { ids: v.array(v.string()) },
  handler: (ctx, args) => missingIngredientIds(ctx, args),
});
