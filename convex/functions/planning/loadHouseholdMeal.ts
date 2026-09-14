import { ConvexError } from "convex/values";

import type { Doc, Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";

type Args = {
  householdId: Id<"households">;
  mealId: Id<"plannedMeals">;
};

/**
 * The household's plate, refusing anything else.
 *
 * The id arrives from the client, and a plate belongs to a household — not to whoever can name one.
 * The split is the one `commitPlan` draws for a recipe: a missing id is `NOT_FOUND`, a foreign one
 * `FORBIDDEN`, and a plate of somebody else's week is not editable by naming it.
 */
export const loadHouseholdMeal = async (
  ctx: Pick<QueryCtx, "db">,
  { householdId, mealId }: Args,
): Promise<Doc<"plannedMeals">> => {
  const meal = await ctx.db.get(mealId);

  if (!meal) throw new ConvexError({ code: "NOT_FOUND", message: "No such planned meal." });
  if (meal.householdId !== householdId) throw new ConvexError({ code: "FORBIDDEN" });

  return meal;
};
