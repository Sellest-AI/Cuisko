import { v } from "convex/values";

import { computeNutrition } from "@convex/functions/recipes/computeNutrition";
import { internalQuery } from "@convex/procedures";
import { vLocale } from "@convex/schema/i18n";
import { vRecipeUnit } from "@convex/schema/ingredients";

/**
 * The nutrition of recipes, or of ingredient lines, for the assistant's `computeNutrition` tool.
 *
 * Internal for the reason `search._internal` is: the tool runs inside a scheduled action with no
 * identity. Ids arrive as `v.string()` rather than `v.id()` because a model carried them, and a
 * malformed one must come back named, not fail the whole call — see `missingRecipeIds`.
 */
export const _internal = internalQuery({
  args: {
    recipeIds: v.optional(v.array(v.string())),
    lines: v.optional(
      v.array(v.object({ ingredientId: v.string(), quantity: v.number(), unit: vRecipeUnit })),
    ),
    servings: v.optional(v.number()),
    locale: vLocale,
  },
  handler: (ctx, args) => computeNutrition(ctx, args),
});
