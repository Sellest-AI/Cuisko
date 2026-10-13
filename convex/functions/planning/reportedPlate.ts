import type { Doc } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";
import type { ReportedPlate } from "@convex/schema/events";

import { reportedRecipeOf } from "../recipes/reportedRecipe";

/**
 * A plate as every plate event carries it (ADR 0019): its own id, its week's and its recipe's, so
 * PostHog can follow one plate from `plate planned` or `week planned` to `meal cooked`, `skipped` or
 * `removed`, and group any of them by recipe.
 *
 * Takes the ids rather than loading the plate, because `meal removed` reports a plate already deleted.
 */
type PlateIds = Pick<Doc<"plannedMeals">, "_id" | "mealPlanId" | "recipeId">;

/** From the recipe the writer already loaded (`cookMeal`), so the report reads nothing. */
export const reportedPlateOf = (plate: PlateIds, recipe: Doc<"recipes"> | null): ReportedPlate => ({
  plannedMealId: plate._id,
  mealPlanId: plate.mealPlanId,
  ...reportedRecipeOf(plate.recipeId, recipe),
});

/** The same, for a writer that never loaded the recipe. */
export const reportedPlate = async (ctx: Pick<QueryCtx, "db">, plate: PlateIds): Promise<ReportedPlate> =>
  reportedPlateOf(plate, await ctx.db.get(plate.recipeId));
