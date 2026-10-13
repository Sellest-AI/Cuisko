import type { Doc, Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";

import { laterPlates, releaseClaim } from "./syncMealLines";

type Args = { mealId: Id<"plannedMeals"> };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When the clock closes a plate nobody cooked: its own day, then the day after it in full.
 *
 * `date` is the plate's local midnight, so this is local midnight two days on — give or take the
 * hour a DST change moves it by, which nothing here minds. Not one day, deliberately: `cookMeal`
 * still finds yesterday's plate, so a dinner finished after midnight lands on it, and a skip at
 * the first midnight would close a plate the cook could still settle. This fires the moment that
 * window shuts.
 */
export const skipAt = (date: number): number => date + 2 * DAY_MS;

/**
 * Closes a plate the household walked past: its claims come off the grocery list, and the plate
 * reads `skipped` rather than short of groceries for a meal that is not going to happen.
 *
 * Run by the scheduler at `skipAt`, and **a no-op unless the plate is still `planned`**: a cooked
 * plate has been settled, a dropped one is gone, and a skipped one is done — each job checks first
 * and writes nothing otherwise, which is why nothing has to be cancelled when a plate changes hands.
 *
 * The claims go the way a cooked plate's do (`releaseClaim`): a jar bought for the week is handed
 * to the next plate living off it, and anything else is given back to the list row. Unlike cooking,
 * `groceryQuantity` is cleared with the pointers — it recorded what was bought for a dish that was
 * eaten, and nothing was eaten here. `quantity` and `unit` stay as the record of what was planned,
 * and the rows stay with them, so the ledger's shape matches a cooked plate's for every reader.
 *
 * Returns the plate it skipped, or `null` when it left the plate alone.
 */
export const skipMeal = async (ctx: MutationCtx, { mealId }: Args): Promise<Doc<"plannedMeals"> | null> => {
  const plate = await ctx.db.get(mealId);
  if (!plate || plate.status !== "planned") return null;

  const ledger = await ctx.db
    .query("plannedMealIngredients")
    .withIndex("by_planned_meal", (q) => q.eq("plannedMealId", plate._id))
    .collect();

  // "Later" is read from the plate's own calendar: the server has no client day to borrow.
  let later: ReturnType<typeof laterPlates> | undefined;
  const plates = () => (later ??= laterPlates(ctx, plate.householdId, plate._id, plate.date + DAY_MS));

  for (const row of ledger) {
    await releaseClaim(ctx, row, plates);

    await ctx.db.patch(row._id, {
      groceryQuantity: undefined,
      groceryListItemId: undefined,
      cellarItemId: undefined,
      updatedAt: Date.now(),
    });
  }

  await ctx.db.patch(plate._id, { status: "skipped", updatedAt: Date.now() });

  return plate;
};
