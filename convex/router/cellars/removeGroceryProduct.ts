import { removeGroceryProduct } from "@convex/functions/cellars/removeGroceryProduct";
import { captureEvent } from "@convex/lib/posthog/captureEvent";
import { householdMutation } from "@convex/procedures";
import { v } from "convex/values";

/** The tap that takes a product off the list, reported as `grocery product removed` (ADR 0019). */
export const authed = householdMutation({
  args: {
    productId: v.id("groceryProducts"),
  },
  handler: async (ctx, args): Promise<void> => {
    const removed = await removeGroceryProduct(ctx, { ...args, householdId: ctx.householdId });
    if (!removed) return;

    await captureEvent(ctx, {
      event: "grocery product removed",
      distinctId: ctx.userId,
      householdId: ctx.householdId,
      properties: { groceryProductId: args.productId },
    });
  },
});
