import { addToCellar } from "@convex/functions/cellars/addToCellar";
import { householdMutation, internalMutation } from "@convex/procedures";
import { vUnit } from "@convex/schema/ingredients";
import { v } from "convex/values";

const args = {
  ingredientId: v.id("ingredients"),
  unit: vUnit,
  quantity: v.number(),
};

/**
 * `strikeList: false` is the undo of a removal: the stock goes back, and the grocery list is left
 * as it was. Returns the row only; what the add struck is the assistant's to know, not the screen's.
 */
export const authed = householdMutation({
  args: { ...args, strikeList: v.optional(v.boolean()) },
  handler: async (ctx, a) => (await addToCellar(ctx, { ...a, householdId: ctx.householdId })).cellarItemId,
});

/**
 * The assistant's addToCellar tool, one call per line. Internal because the turn runs as a
 * scheduled action with no signed-in user: `householdId` is the one `sendMessage` checked.
 */
export const _internal = internalMutation({
  args: { ...args, householdId: v.id("households") },
  handler: (ctx, a) => addToCellar(ctx, a),
});
