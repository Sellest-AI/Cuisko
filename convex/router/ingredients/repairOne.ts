import { repairIngredient } from "@convex/functions/ingredients/repairIngredient";
import { captureException } from "@convex/lib/posthog/captureException";
import { internalAction } from "@convex/procedures";
import { vRepairableField } from "@convex/schema/ingredientPayloads";
import { v } from "convex/values";

/**
 * Fills the fields one catalog row lacks — see `repairIngredient`. Scheduled by a recipe save for
 * each row that cannot yet give the recipe its nutrition or its Cui-Score, joined to that save's
 * trace, so the spend is filed under the cook who saved.
 *
 * A refused weight ("10 cl de poulet": chicken has no density) is reported to Error tracking, under
 * the same person, or under the row when the trace carries nobody (a script). One message for every
 * refusal, so PostHog groups them in one issue. A nutrient lowered to the row's own figure
 * ("sugars 5 > carbohydrates 1") is reported the same way, in an issue of its own: the model, or
 * the row, is wrong, and the lowered figure trusts the row.
 *
 * @costly
 */
export const _internal = internalAction({
  args: {
    ingredientId: v.id("ingredients"),
    missing: v.array(vRepairableField),
    recipeTitle: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const { refused, contradicted } = await repairIngredient(ctx, args);
    const report = (message: string, properties: Record<string, string>) =>
      captureException(ctx, {
        error: new Error(message),
        distinctId: ctx.trace?.distinctId ?? args.ingredientId,
        properties: { ingredientId: args.ingredientId, ...properties, feature: "ingredient repair" },
      });

    if (refused.length) await report("repairIngredient refused a field", { refused: refused.join(",") });
    if (contradicted.length)
      await report("repairIngredient lowered a nutrient the row contradicts", {
        contradicted: contradicted.join(", "),
      });
  },
});
