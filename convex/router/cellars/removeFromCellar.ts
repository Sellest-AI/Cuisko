import { removeFromCellar } from "@convex/functions/cellars/removeFromCellar";
import { householdMutation, internalMutation } from "@convex/procedures";
import { vUnit } from "@convex/schema/ingredients";
import { v } from "convex/values";

const args = {
  ingredientId: v.id("ingredients"),
  unit: vUnit,
  quantity: v.number(),
};

export const authed = householdMutation({
  args: {
    ...args,
    /** How much of it goes back on the grocery list — the undo decision, made by the client. */
    restoreToList: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    await removeFromCellar(ctx, { ...a, householdId: ctx.householdId });
  },
});

/**
 * The assistant's removeFromCellar tool, one call per line. Internal because the turn runs as a
 * scheduled action with no signed-in user: `householdId` is the one `sendMessage` checked.
 */
export const _internal = internalMutation({
  args: { ...args, householdId: v.id("households") },
  handler: (ctx, a) => removeFromCellar(ctx, a),
});
