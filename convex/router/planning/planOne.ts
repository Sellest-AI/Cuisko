import { v } from "convex/values";

import type { Id } from "@convex/_generated/dataModel";
import { planMeal } from "@convex/functions/planning/planMeal";
import { reportedPlate } from "@convex/functions/planning/reportedPlate";
import { captureEvent } from "@convex/lib/posthog/captureEvent";
import { vMealSlot } from "@convex/schema/households";
import { householdMutation, internalMutation, type MutationCtx } from "@convex/procedures";

const args = {
  recipeId: v.id("recipes"),
  date: v.number(),
  slot: vMealSlot,
  servings: v.number(),
  today: v.number(),
};

/**
 * `planMeal`, reported as `plate planned` under the cook who asked, with the plate it wrote and its
 * recipe (ADR 0019). The summary goes to PostHog and not back to the caller, which gets what it
 * always got.
 */
const _planAndReport = async (
  ctx: MutationCtx,
  { actor, isUndo, ...a }: Parameters<typeof planMeal>[1] & { actor: Id<"users">; isUndo?: boolean },
) => {
  const { summary, ...planned } = await planMeal(ctx, a);

  await captureEvent(ctx, {
    event: "plate planned",
    distinctId: actor,
    householdId: a.householdId,
    properties: {
      ...summary,
      ...(await reportedPlate(ctx, { _id: planned.plannedMealId, mealPlanId: planned.mealPlanId, recipeId: a.recipeId })),
      people: a.servings,
      replaced: planned.replaced ? 1 : 0,
      isUndo: isUndo ?? false,
    },
  });

  return planned;
};

/**
 * Puts one dish on one plate of the kept week — the recipe screen's "add to my list".
 *
 * `householdMutation`, so membership is the authorization and `ctx.householdId` is the only week
 * this call can write to. The recipe may be anyone's (ADR 0014): the catalog is shared, and a plate
 * holds an id, not a copy. A plate already on that day and slot is replaced — see `planMeal`.
 *
 * Returns the plan id only, as it always has: the screen needs nothing more.
 */
export const authed = householdMutation({
  /** `isUndo`: the chat's undo putting back the dish Cuisko replaced. Only reported, never acted on. */
  args: { ...args, isUndo: v.optional(v.boolean()) },
  handler: async (ctx, a) =>
    (await _planAndReport(ctx, { ...a, householdId: ctx.householdId, actor: ctx.userId })).mealPlanId,
});

/**
 * The same plate, for Cuisko: its turn is a scheduled action with no signed-in cook, so the
 * household and the cook arrive as the ones `sendMessage` checked. Returns the plate and what it
 * replaced, which the chat's undo needs.
 */
export const _internal = internalMutation({
  args: { ...args, householdId: v.id("households"), actor: v.id("users") },
  handler: _planAndReport,
});
