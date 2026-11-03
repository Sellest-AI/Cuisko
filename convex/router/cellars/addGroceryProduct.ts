import { addGroceryProduct } from "@convex/functions/cellars/addGroceryProduct";
import { captureEvent } from "@convex/lib/posthog/captureEvent";
import { householdMutation } from "@convex/procedures";
import { vUnit } from "@convex/schema/ingredients";
import { v } from "convex/values";

/** A non-food product typed into the bar, reported as `grocery product added` (ADR 0019). */
export const authed = householdMutation({
  args: {
    name: v.string(),
    unit: vUnit,
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const landed = await addGroceryProduct(ctx, { ...args, householdId: ctx.householdId });

    await captureEvent(ctx, {
      event: "grocery product added",
      distinctId: ctx.userId,
      householdId: ctx.householdId,
      properties: { groceryProductId: landed.id, merged: landed.merged },
    });

    return landed;
  },
});
