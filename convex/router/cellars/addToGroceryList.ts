import { addToGroceryList } from "@convex/functions/cellars/addToGroceryList";
import { householdMutation } from "@convex/procedures";
import { vUnit } from "@convex/schema/ingredients";
import { v } from "convex/values";

export const authed = householdMutation({
  args: {
    ingredientId: v.id("ingredients"),
    unit: vUnit,
    quantity: v.number(),
  },
  handler: (ctx, args) => addToGroceryList(ctx, { ...args, householdId: ctx.householdId }),
});
