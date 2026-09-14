import { ConvexError } from "convex/values";

import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";

import { availableStock } from "./availableStock";
import { cellarLots } from "./cellarLots";
import { isServings } from "./limits";
import { loadHouseholdMeal } from "./loadHouseholdMeal";
import { recipeLines } from "./recipeLines";
import { scaleLines } from "./scaleLines";
import { ownedTickKey, syncMealLines, type MealLine } from "./syncMealLines";

type Args = {
  householdId: Id<"households">;
  mealId: Id<"plannedMeals">;
  servings: number;
  /** Local-day timestamp, the client's — the same "today" the commit that wrote the meal was given. */
  today: number;
};

/**
 * Re-portions one plate of the kept week, and moves the grocery list with it.
 *
 * **The quantities are recomputed here, never taken from the client** — the rule `commitPlan` runs
 * on a whole week, applied to the one plate that changed. The new lines are weighed against what
 * the cellar can still give once every OTHER plate has taken its share (`availableStock` is told
 * `except` this meal, so its own old reservations are not charged against its new ones).
 *
 * ⚠️ **That pool is an aggregate, and it is exact only for the plate the week was eaten around
 * last.** A sibling's ledger row records its full requirement, not the part it actually drew from
 * the cellar, so a plate scored before its siblings bought under-counts the pool by exactly what
 * they bought. `commitPlan` runs its split in eating order and is exact; a one-plate re-scale
 * cannot recover the order. The no-op guard below keeps the sharpest edge — doing nothing must not
 * move the list — and the true fix, recording what each line drew, is a ledger change not made here.
 *
 * `syncMealLines` replaces the ledger rather than appending, and every row it deletes gives its
 * `groceryQuantity` back first — so the list ends up asking for what the new serving needs and for
 * nothing the old one did.
 */
export const rescaleMeal = async (ctx: MutationCtx, args: Args): Promise<void> => {
  const meal = await loadHouseholdMeal(ctx, args);

  if (!isServings(args.servings))
    throw new ConvexError({ code: "INVALID_INPUT", message: "Servings must be a whole number, 1 to 8." });

  /**
   * A cooked meal's ledger is the record cooking will settle against, and a day behind the user is
   * done with whatever it held — re-portioning either would write fresh claims for a meal that is
   * no longer ahead of the household.
   */
  if (meal.status !== "planned" || meal.date < args.today)
    throw new ConvexError({ code: "INVALID_INPUT", message: "Only a meal still ahead can be re-portioned." });

  /**
   * Nothing to move, so nothing is touched. The re-sync rewrites every row and re-opens settled
   * grocery claims, and the aggregate pool it re-splits against is an approximation — running that
   * for no change can only add noise to the list, never correct it.
   */
  if (meal.servings === args.servings) return;

  const [recipe, existing] = await Promise.all([
    ctx.db.get(meal.recipeId),
    ctx.db
      .query("plannedMealIngredients")
      .withIndex("by_planned_meal", (q) => q.eq("plannedMealId", meal._id))
      .collect(),
  ]);

  // Defensive: the cascade deletes a planned meal with its recipe, so only data from before that
  // rule existed can land here.
  if (!recipe) throw new ConvexError({ code: "NOT_FOUND", message: "No such recipe." });

  const [stock, lots, lines] = await Promise.all([
    availableStock(ctx, args.householdId, args.today, meal._id),
    cellarLots(ctx, args.householdId),
    recipeLines(ctx, meal.recipeId),
  ]);

  /**
   * The shopper's "already in the kitchen" was answered once, at commit, and the ledger's `owned`
   * is the only record of the answer — read back, so a line they ticked stays off the list however
   * much the plate grows. The cellar's verdict is re-run from scratch: a line it covered at commit
   * and cannot cover at the new size goes on the list, because nobody ever said they had it. The
   * key is ingredient and unit together, matching how the tick was taken: claiming the grams of an
   * onion never claimed the pieces of it.
   */
  const ticks = new Set(
    existing.filter((row) => row.owned === true).map((row) => ownedTickKey(row.ingredientId, row.sourceUnit)),
  );

  const needs = scaleLines(lines.map(({ line }) => line), {
    recipeServings: recipe.servings,
    servings: args.servings,
  });

  const mealLines: MealLine[] = needs.map((need, index) => ({
    need,
    ingredient: lines[index]!.ingredient,
    owned: ticks.has(ownedTickKey(need.ingredientId, need.unit)),
  }));

  await syncMealLines(ctx, {
    householdId: args.householdId,
    plannedMealId: meal._id,
    lines: mealLines,
    stock,
    lots,
    from: args.today,
  });

  // The plate is what the lists and the sheet read `servings` from; the ledger only records its lines.
  await ctx.db.patch(meal._id, { servings: args.servings, updatedAt: Date.now() });
};
