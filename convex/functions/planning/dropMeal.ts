import { ConvexError } from "convex/values";

import type { Doc, Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";

import { loadHouseholdMeal } from "./loadHouseholdMeal";
import { syncMealLines } from "./syncMealLines";

type Args = {
  householdId: Id<"households">;
  mealId: Id<"plannedMeals">;
  /** Local-day timestamp, the client's: the first day a plate still counts as ahead of the household. */
  today: number;
};

/**
 * Drops one plate from the kept week, and takes its claims off the grocery list with it.
 *
 * The taking-back is `syncMealLines` with no lines: its replacement pass deletes every ledger row
 * and gives each one's `groceryQuantity` back first, so the list stops shopping for a meal nobody
 * is cooking while keeping what the household's other plates put on the same rows. A jar this
 * plate bought for the week is handed to the next plate still needing it rather than given back.
 *
 * **The plan row goes with its last plate.** The reads draw plates and never plans, so `mealPlans`
 * exists to describe a run of the tunnel — and a run whose every meal is gone describes a week
 * nobody has. A plan that keeps any plate is left as the run it was: `days` and `slots` say what
 * was generated, not what survived the edit.
 *
 * Returns the plate as it was before it went, for a caller that reports what it dropped.
 */
export const dropMeal = async (ctx: MutationCtx, { householdId, mealId, today }: Args): Promise<Doc<"plannedMeals">> => {
  const meal = await loadHouseholdMeal(ctx, { householdId, mealId });

  /**
   * A cooked meal's ledger is the record the cook step will settle against — dropping the plate
   * would drop that arithmetic with it. A skipped plate is the week's history the same way: what
   * sat on a past day stays on it.
   */
  if (meal.status !== "planned")
    throw new ConvexError({ code: "INVALID_INPUT", message: "The meal is already cooked or skipped." });

  // No lines: the back-out pass is the whole job here, and nothing is written in their place.
  await syncMealLines(ctx, {
    householdId,
    plannedMealId: mealId,
    lines: [],
    stock: new Map(),
    lots: new Map(),
    from: today,
  });

  await ctx.db.delete(mealId);

  const remaining = await ctx.db
    .query("plannedMeals")
    .withIndex("by_meal_plan", (q) => q.eq("mealPlanId", meal.mealPlanId))
    .collect();

  if (remaining.length === 0) await ctx.db.delete(meal.mealPlanId);

  return meal;
};
