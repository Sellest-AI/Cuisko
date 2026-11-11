import { patchIngredient } from "@convex/functions/ingredients/patchIngredient";
import { internalMutation } from "@convex/procedures";
import { vIngredientPatch, vRepairableField } from "@convex/schema/ingredientPayloads";
import { v } from "convex/values";

/**
 * A partial update of a catalog row — see `patchIngredient`. Internal: the catalog is reference
 * data, and the write a repair job cannot perform itself (an action has no `ctx.db`).
 */
export const _internal = internalMutation({
  args: {
    ingredientId: v.id("ingredients"),
    fields: vIngredientPatch,
    repaired: v.optional(v.boolean()),
  },
  returns: v.object({ written: v.array(vRepairableField) }),
  handler: (ctx, { ingredientId, fields, ...options }) =>
    patchIngredient(ctx, ingredientId, fields, options),
});
