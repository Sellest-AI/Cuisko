import { internal } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { missingFields } from "@convex/functions/ingredients/missingFields";
import type { TracedMutationCtx } from "@convex/procedures";
import type { RecipeUnit } from "@shared/ingredients";

import type { WeighableLine } from "./recipeNutrition";

/**
 * The most repair jobs one save schedules. A recipe with more rows missing fields keeps the rest
 * for its next save: each job is one paid call, and a save must not buy forty of them.
 */
export const MAX_REPAIRS = 30;

type ScheduleRepairsOptions = {
  /** The recipe that asked, shown to the model as context. */
  recipeTitle?: string;
};

/**
 * One repair job per catalog row these lines cannot yet weigh or score, scheduled from the save's
 * own mutation.
 *
 * `lines` are the rows `computeTags` already loaded to decide the tags, so this makes no read of
 * its own. A recipe missing a line hands none — it can never show a score, so a repair buys it
 * nothing. A row written in two units is one job asking for both units' weights.
 *
 * The job carries no recipeId: what it fills belongs to the row, and `patchIngredient` refreshes
 * every recipe that uses it.
 */
export const scheduleRepairs = async (
  ctx: TracedMutationCtx,
  lines: WeighableLine[],
  { recipeTitle }: ScheduleRepairsOptions = {},
): Promise<void> => {
  const rows = new Map<Id<"ingredients">, { row: Doc<"ingredients">; units: RecipeUnit[] }>();
  for (const { ingredient, unit } of lines) {
    const entry = rows.get(ingredient._id) ?? { row: ingredient, units: [] };
    entry.units.push(unit);
    rows.set(ingredient._id, entry);
  }

  const jobs = [...rows.values()]
    .map(({ row, units }) => ({
      ingredientId: row._id,
      missing: missingFields(row, units),
      recipeTitle,
    }))
    .filter(({ missing }) => missing.length > 0)
    .slice(0, MAX_REPAIRS);

  for (const job of jobs) await ctx.scheduleTracedAfter(0, internal.router.ingredients.repairOne._internal, job);
};
