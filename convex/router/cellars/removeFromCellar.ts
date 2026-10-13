import { removeFromCellar } from "@convex/functions/cellars/removeFromCellar";
import { reportedIngredient } from "@convex/functions/ingredients/reportedIngredient";
import { captureEvent } from "@convex/lib/posthog/captureEvent";
import { householdMutation, internalMutation } from "@convex/procedures";
import { vUnit } from "@convex/schema/ingredients";
import { v } from "convex/values";

const args = {
  ingredientId: v.id("ingredients"),
  unit: vUnit,
  quantity: v.number(),
};

/**
 * Food off the shelf. Reported as `purchase undone` (ADR 0019) only when the client says it is taking
 * back a purchase inside its undo window: the server cannot tell (see `removeFromCellar`), the
 * client holds the receipt. Any other removal sends nothing yet.
 */
export const authed = householdMutation({
  args: {
    ...args,
    /** How much of it goes back on the grocery list — the undo decision, made by the client. */
    restoreToList: v.optional(v.number()),
    /** Whether this takes back a purchase still inside its undo window. Only reported, never acted on. */
    isUndo: v.optional(v.boolean()),
  },
  handler: async (ctx, { isUndo, ...a }) => {
    const { cellarItemId } = await removeFromCellar(ctx, { ...a, householdId: ctx.householdId });
    if (!isUndo) return;

    await captureEvent(ctx, {
      event: "purchase undone",
      distinctId: ctx.userId,
      householdId: ctx.householdId,
      properties: { cellarItemId, ...(await reportedIngredient(ctx, a.ingredientId)) },
    });
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
