import { removeFromGroceryList } from "@convex/functions/cellars/removeFromGroceryList";
import { householdMutation } from "@convex/procedures";
import { vUnit } from "@convex/schema/ingredients";
import { v } from "convex/values";

export const authed = householdMutation({
  args: {
    ingredientId: v.id("ingredients"),
    unit: vUnit,
  },
  handler: (ctx, args) => removeFromGroceryList(ctx, { ...args, householdId: ctx.householdId }),
});
