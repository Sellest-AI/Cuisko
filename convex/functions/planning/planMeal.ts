import { ConvexError } from "convex/values";

import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import type { MealSlot } from "@shared/mealSlots";

import { commitPlan, type PlanSummary } from "./commitPlan";

type Args = {
  householdId: Id<"households">;
  recipeId: Id<"recipes">;
  /** Local-day timestamp, the client's — "Tuesday" has to mean its Tuesday. */
  date: number;
  slot: MealSlot;
  servings: number;
  /** Local-day timestamp of today: the first day a plate can land on, and the first that holds stock. */
  today: number;
};

export type PlannedMeal = {
  mealPlanId: Id<"mealPlans">;
  plannedMealId: Id<"plannedMeals">;
  /**
   * The planned plate this one took the slot of, so an undo can put it back. Absent on an empty
   * slot. A cooked or skipped plate is never replaced — `commitPlan` refuses it — so it is never here.
   */
  replaced?: { recipeId: Id<"recipes">; servings: number };
  /** What the plate came to — `commitPlan`'s, for the router to report. */
  summary: PlanSummary;
};

/**
 * Puts one dish on one plate of the kept week, from the recipe screen or from Cuisko.
 *
 * The second caller of `commitPlan`, not a second implementation: a plate planned here goes down
 * the same path as a week the tunnel generated — the recipe's lines are weighed against the cellar,
 * the ledger is written, and what is missing lands on the grocery list. It is a plan of one plate,
 * with no `seed` because nothing shuffled it, and `people` is the plate's own `servings` because
 * there is no run to describe.
 *
 * **A plate already on that day and slot is replaced**, not refused: the screen shows the dish it
 * will replace and asks first, so by the time this runs the answer is yes. The replacing is
 * `commitPlan`'s own rule, and so is its refusal of a cooked plate, which is the one thing on a
 * slot that cannot be replaced.
 *
 * Yesterday is refused: a plate behind the household is a week it lived, and `availableStock` would
 * not count its reservations anyway.
 *
 * The replaced plate is the one `commitPlan` dropped to make room, so what an undo would put back
 * is exactly what was there.
 */
export const planMeal = async (ctx: MutationCtx, args: Args): Promise<PlannedMeal> => {
  if (args.date < args.today) throw new ConvexError({ code: "INVALID_INPUT", message: "The day has passed." });

  const { mealPlanId, plannedMealIds, replaced, summary } = await commitPlan(ctx, {
    householdId: args.householdId,
    plates: [{ recipeId: args.recipeId, date: args.date, slot: args.slot, servings: args.servings }],
    people: args.servings,
    today: args.today,
    owned: [],
  });

  // A plan of one plate: one id, since `commitPlan` refuses a plan with none, and at most one plate
  // replaced, since one slot holds one.
  const [previous] = replaced;

  return {
    mealPlanId,
    plannedMealId: plannedMealIds[0]!,
    replaced: previous && { recipeId: previous.recipeId, servings: previous.servings },
    summary,
  };
};
