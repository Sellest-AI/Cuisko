import { ConvexError } from "convex/values";

import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import type { MealSlot } from "@shared/mealSlots";

import { commitPlan } from "./commitPlan";
import { dropMeal } from "./dropMeal";

type Args = {
  householdId: Id<"households">;
  userId: Id<"users">;
  recipeId: Id<"recipes">;
  /** Local-day timestamp, the client's — "Tuesday" has to mean its Tuesday. */
  date: number;
  slot: MealSlot;
  servings: number;
  /** Local-day timestamp of today: the first day a plate can land on, and the first that holds stock. */
  today: number;
};

/**
 * Puts one dish on one plate of the kept week, from the recipe screen.
 *
 * The second caller of `commitPlan`, not a second implementation: a plate planned here goes down
 * the same path as a week the tunnel generated — the recipe's lines are weighed against the cellar,
 * the ledger is written, and what is missing lands on the grocery list. It is a plan of one plate,
 * with no `seed` because nothing shuffled it, and `people` is the plate's own `servings` because
 * there is no run to describe.
 *
 * **A plate already on that day and slot is replaced**, not refused: the screen shows the dish it
 * will replace and asks first, so by the time this runs the answer is yes. Replacing is `dropMeal`
 * then `commitPlan`, in that order, so the old plate's claims are given back before the new one's
 * are weighed — or the cellar would be reserved for both. `dropMeal` also refuses a cooked plate,
 * which is the one thing on a slot that cannot be replaced.
 *
 * Yesterday is refused: a plate behind the household is a week it lived, and `availableStock` would
 * not count its reservations anyway.
 */
export const planMeal = async (ctx: MutationCtx, args: Args): Promise<Id<"mealPlans">> => {
  if (args.date < args.today) throw new ConvexError({ code: "INVALID_INPUT", message: "The day has passed." });

  const onThatDay = await ctx.db
    .query("plannedMeals")
    .withIndex("by_household_and_date", (q) => q.eq("householdId", args.householdId).eq("date", args.date))
    .collect();
  const replaced = onThatDay.find((meal) => meal.slot === args.slot);

  if (replaced) await dropMeal(ctx, { householdId: args.householdId, mealId: replaced._id, today: args.today });

  return commitPlan(ctx, {
    householdId: args.householdId,
    userId: args.userId,
    plates: [{ recipeId: args.recipeId, date: args.date, slot: args.slot, servings: args.servings }],
    people: args.servings,
    today: args.today,
    owned: [],
  });
};
