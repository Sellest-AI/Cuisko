import { suggestDishes } from "@convex/agent/tools/suggestDishes";
import { internalAction } from "@convex/procedures";
import { vCuisine } from "@convex/schema/recipePayloads";
import { VEGETARIAN_DIETS } from "@shared/diets";
import { v } from "convex/values";

/**
 * Dish names for one cuisine, asked for by the `seed:catalog` script through a deploy key.
 *
 * Internal because only that script calls it, and it spends a model call per call. Nothing is
 * written: the script keeps the list of what it searched in its ledger, and hands the dishes of
 * this cuisine back as `avoid`.
 *
 * @costly
 */
export const _internal = internalAction({
  args: { cuisine: vCuisine, count: v.number(), avoid: v.array(v.string()) },
  returns: v.array(
    v.object({
      name: v.string(),
      nameEn: v.string(),
      veganEn: v.optional(v.string()),
      diet: v.optional(v.union(...VEGETARIAN_DIETS.map(v.literal))),
    }),
  ),
  // Spread, as every other `.run` caller does: `ToolCtx` refuses the ctx typed to this app's data
  // model, and accepts a copy of it. No `userId`: nobody owns a catalog suggestion.
  handler: (ctx, args) => suggestDishes.run({ ...ctx }, args),
});
