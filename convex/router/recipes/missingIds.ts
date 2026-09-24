import { v } from "convex/values";

import { missingRecipeIds } from "@convex/functions/recipes/missingRecipeIds";
import { internalQuery } from "@convex/procedures";

/**
 * The ids the assistant's display tool was handed that are not a live recipe.
 *
 * Internal only: its one caller is a tool running inside an assistant turn, and `v.string()` rather
 * than `v.id()` is deliberate — see `missingRecipeIds`.
 */
export const _internal = internalQuery({
  args: { ids: v.array(v.string()) },
  handler: (ctx, args) => missingRecipeIds(ctx, args),
});
