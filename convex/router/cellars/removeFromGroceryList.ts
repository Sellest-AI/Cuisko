import { removeFromGroceryList } from "@convex/functions/cellars/removeFromGroceryList";
import { reportedIngredient } from "@convex/functions/ingredients/reportedIngredient";
import { captureEvent } from "@convex/lib/posthog/captureEvent";
import { householdMutation } from "@convex/procedures";
import { vUnit } from "@convex/schema/ingredients";
import { v } from "convex/values";

/**
 * The cook striking an ingredient off the list without buying it, reported as `grocery item
 * removed` (ADR 0019). A purchase leaves the list through `addToCellar` instead, so this is the only
 * other way out: whether it was a mistap or "not needed any more" is the time since the
 * `grocery item added`, which PostHog reads, not a flag.
 */
export const authed = householdMutation({
  args: {
    ingredientId: v.id("ingredients"),
    unit: vUnit,
  },
  handler: async (ctx, args): Promise<void> => {
    const lines = await removeFromGroceryList(ctx, { ...args, householdId: ctx.householdId });

    await captureEvent(ctx, {
      event: "grocery item removed",
      distinctId: ctx.userId,
      householdId: ctx.householdId,
      properties: { ...(await reportedIngredient(ctx, args.ingredientId)), lines },
    });
  },
});
