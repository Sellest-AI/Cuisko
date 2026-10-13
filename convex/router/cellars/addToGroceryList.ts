import { addToGroceryList } from "@convex/functions/cellars/addToGroceryList";
import { reportedIngredient } from "@convex/functions/ingredients/reportedIngredient";
import { captureEvent } from "@convex/lib/posthog/captureEvent";
import { householdMutation } from "@convex/procedures";
import { vUnit } from "@convex/schema/ingredients";
import { v } from "convex/values";

/**
 * An item the cook puts on the grocery list by hand, reported as `grocery item added` (ADR 0019).
 *
 * Reported here and not in `addToGroceryList`, which a planned week (`syncMealLines`) and the undo
 * of a purchase (`removeFromCellar`) also write through: the week's lines are already counted on
 * `week planned`, and an undo is not an add.
 */
export const authed = householdMutation({
  args: {
    ingredientId: v.id("ingredients"),
    unit: vUnit,
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const landed = await addToGroceryList(ctx, { ...args, householdId: ctx.householdId });

    await captureEvent(ctx, {
      event: "grocery item added",
      distinctId: ctx.userId,
      householdId: ctx.householdId,
      properties: { groceryListItemId: landed.id, ...(await reportedIngredient(ctx, args.ingredientId)) },
    });

    return landed;
  },
});
