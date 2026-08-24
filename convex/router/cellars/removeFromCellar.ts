import { removeFromCellar } from "@convex/functions/cellars/removeFromCellar";
import { householdMutation } from "@convex/procedures";
import { vUnit } from "@convex/schema/ingredients";
import { v } from "convex/values";

export const authed = householdMutation({
  args: {
    ingredientId: v.id("ingredients"),
    unit: vUnit,
    quantity: v.number(),
    /** How much of it goes back on the grocery list — the undo decision, made by the client. */
    restoreToList: v.optional(v.number()),
  },
  handler: (ctx, args) => removeFromCellar(ctx, { ...args, householdId: ctx.householdId }),
});
