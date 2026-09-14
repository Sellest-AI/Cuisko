import type { Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";
import { toStockUnit, type Unit } from "@shared/ingredients";

import type { Stock } from "./selectMeals";

type Amount = { ingredientId: Id<"ingredients">; quantity: number; unit: Unit };

/**
 * What the household's cellar can still give a new plan, per ingredient, in its stock unit.
 *
 * The cellar, minus every line of every meal already planned from `from` onward — plus the presence
 * of anything a planned meal has already put on the grocery list, because a jar on the list covers
 * the pinches still to come. Only `planned` meals reserve: nothing in this slice decrements the
 * cellar when a meal is cooked, so counting a cooked or past meal would hold stock hostage forever.
 *
 * Every ingredient the cellar holds is a key, even when none of it converts or all of it is
 * reserved — see `Stock` for why presence and amount are answered separately. Amounts floor at 0:
 * a reservation larger than the cellar (a lot eaten without being cooked through the app) means
 * nothing is left, not that something is owed.
 */
export const availableStock = async (
  ctx: QueryCtx,
  householdId: Id<"households">,
  /** The date from which to consider planned meals. */
  from: number,
  /**
   * A meal whose own reservations are left out of the read.
   *
   * Re-portioning a plate must weigh its new lines against the pool it was scored against when the
   * week was committed — what the household held once every OTHER plate had taken its share. Every
   * planned meal's ledger is subtracted here, so the plate being re-portioned is named and its own
   * old reservations are not charged against its new ones.
   */
  except?: Id<"plannedMeals">,
): Promise<Stock> => {
  const [cellar, meals] = await Promise.all([
    ctx.db
      .query("cellarItems")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .collect(),
    ctx.db
      .query("plannedMeals")
      .withIndex("by_household_and_date", (q) => q.eq("householdId", householdId).gte("date", from))
      .collect(),
  ]);

  const reserved = (
    await Promise.all(
      meals
        .filter((meal) => meal.status === "planned" && meal._id !== except)
        .map((meal) =>
          ctx.db
            .query("plannedMealIngredients")
            .withIndex("by_planned_meal", (q) => q.eq("plannedMealId", meal._id))
            .collect(),
        ),
    )
  ).flat();

  const ingredients = new Map(
    await Promise.all(
      [...new Set([...cellar, ...reserved].map((row) => row.ingredientId))].map(
        async (id) => [id, await ctx.db.get(id)] as const,
      ),
    ),
  );

  // A row whose ingredient has been deleted, or whose unit cannot reach the stock unit, counts 0.
  const amountOf = ({ ingredientId, quantity, unit }: Amount) => {
    const ingredient = ingredients.get(ingredientId);
    return (ingredient && toStockUnit(quantity, unit, ingredient)) ?? 0;
  };

  const stock: Stock = new Map();
  for (const item of cellar) {
    if (item.quantity <= 0) continue;
    stock.set(item.ingredientId, (stock.get(item.ingredientId) ?? 0) + amountOf(item));
  }

  /**
   * A pinch bought for one plate is present for the plates after it. Within one `syncMealLines` run
   * that bookkeeping is the writer's own; across a read it is these rows — a jar on the grocery
   * list makes the ingredient present at nothing, which covers the pinches still to come and gives
   * a measured line nothing to draw on. Set only when absent, so a cellar row keeps its own amount.
   */
  for (const line of reserved) {
    if (line.quantity === 0 && (line.groceryQuantity ?? 0) > 0 && !stock.has(line.ingredientId))
      stock.set(line.ingredientId, 0);
  }

  for (const line of reserved) {
    const amount = stock.get(line.ingredientId);
    if (amount === undefined) continue;
    stock.set(line.ingredientId, Math.max(0, amount - amountOf(line)));
  }

  return stock;
};
