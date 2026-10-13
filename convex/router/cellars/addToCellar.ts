import type { Id } from "@convex/_generated/dataModel";
import { addToCellar } from "@convex/functions/cellars/addToCellar";
import { reportedIngredientOf } from "@convex/functions/ingredients/reportedIngredient";
import { captureEvent } from "@convex/lib/posthog/captureEvent";
import { householdMutation, internalMutation, type MutationCtx } from "@convex/procedures";
import { vUnit } from "@convex/schema/ingredients";
import { v } from "convex/values";

const args = {
  ingredientId: v.id("ingredients"),
  unit: vUnit,
  quantity: v.number(),
};

/**
 * `addToCellar`, with a purchase reported as `food added to cellar` under the cook who made it
 * (ADR 0019). An undo (`strikeList: false`) is not a purchase: the stock goes back where it was.
 * `struckLines` and the ingredient row stay here; the callers get what they always got.
 */
const _addAndReport = async (
  ctx: MutationCtx,
  { actor, ...a }: Parameters<typeof addToCellar>[1] & { actor: Id<"users"> },
) => {
  const { struckLines, ingredient, ...added } = await addToCellar(ctx, a);

  if (a.strikeList !== false) {
    await captureEvent(ctx, {
      event: "food added to cellar",
      distinctId: actor,
      householdId: a.householdId,
      properties: { cellarItemId: added.cellarItemId, ...reportedIngredientOf(a.ingredientId, ingredient), struckLines },
    });
  }

  return added;
};

/**
 * `strikeList: false` is the undo of a removal: the stock goes back, and the grocery list is left
 * as it was. Returns the row only; what the add struck is the assistant's to know, not the screen's.
 */
export const authed = householdMutation({
  args: { ...args, strikeList: v.optional(v.boolean()) },
  handler: async (ctx, a) =>
    (await _addAndReport(ctx, { ...a, householdId: ctx.householdId, actor: ctx.userId })).cellarItemId,
});

/**
 * The assistant's addToCellar tool, one call per line. Internal because the turn runs as a
 * scheduled action with no signed-in user: `householdId` and `actor` are the ones `sendMessage` checked.
 */
export const _internal = internalMutation({
  args: { ...args, householdId: v.id("households"), actor: v.id("users") },
  handler: _addAndReport,
});
