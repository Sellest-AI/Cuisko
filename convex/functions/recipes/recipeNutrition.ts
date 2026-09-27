import type { Doc, Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";
import type { Category } from "@shared/categories";
import { edibleGrams, type RecipeUnit } from "@shared/ingredients";
import { type RecipeNutrition, totalsOf } from "@shared/nutrition";

type NutritionCtx = Pick<QueryCtx, "db">;

/**
 * **The one producer of a recipe's nutrition** (ADR 0015). The recipe screen reads it through
 * `loadRecipe`, and the assistant's `computeNutrition` tool through `computeNutrition`; a cook who
 * asks Cuisko about a dish and then opens it must read the same figure in both places, so neither
 * computes it on its own.
 */

/** A quantity of a catalog row: what `edibleGrams` weighs and `totalsOf` counts. */
export type WeighableLine = {
  ingredient: Doc<"ingredients">;
  quantity: number;
  unit: RecipeUnit;
};

/**
 * The recipe's lines with their catalog rows, in the order they are written.
 *
 * Ordered by `position` rather than by insertion: the join table carries it precisely because the
 * order of a recipe's ingredients is meaningful, and `by_recipe` orders by creation time, which is
 * only the same thing until a line is edited.
 *
 * The catalog rows are fetched concurrently. It is an N+1 in shape, but bounded by the length of
 * one recipe rather than by the size of a table, and a recipe with forty ingredients does not
 * exist — so the fix for it would be a denormalized name that has to be kept in step with the
 * catalog, which is a worse trade at this size.
 *
 * `lineCount` is what the recipe HAS; `lines` is what resolved. A line whose catalog row is gone is
 * dropped from `lines` rather than asserted (the cascade should make it unreachable), and the
 * caller needs both counts, because a total computed over the difference would be a total missing
 * an ingredient.
 */
export const loadRecipeLines = async (
  ctx: NutritionCtx,
  recipeId: Id<"recipes">,
): Promise<{ lines: WeighableLine[]; lineCount: number }> => {
  const rows = await ctx.db
    .query("recipeIngredients")
    .withIndex("by_recipe", (q) => q.eq("recipeId", recipeId))
    .collect();

  const resolved = await Promise.all(
    [...rows]
      .sort((a, b) => a.position - b.position)
      .map(async ({ ingredientId, quantity, unit }) => {
        const ingredient = await ctx.db.get(ingredientId);

        return ingredient ? { ingredient, quantity, unit } : null;
      }),
  );

  return { lines: resolved.filter((line) => line !== null), lineCount: rows.length };
};

/**
 * The categories the Nutri-Score rewards a dish for containing.
 *
 * The classification lives here rather than in @shared/nutrition, which deliberately takes a
 * boolean: what counts as produce for a food score is a rule about this app's catalog, not a
 * property of arithmetic. Herbs and spices are out — they are produce in a greengrocer's sense and
 * weigh a gram in a dish, so counting them would move the score without moving the meal.
 */
const PRODUCE_CATEGORIES: readonly Category[] = ["VEGETABLE", "FRUIT", "LEGUME", "NUT"];

/**
 * What these lines add up to, or nothing.
 *
 * Refuses in three cases, all of them the same refusal `computeTags` makes and for the same
 * reason: no lines, lines that did not all resolve (`lineCount` above `lines.length`), and —
 * inside `totalsOf` — a line that cannot reach grams. A dish quietly missing its olive oil reads
 * as a health food, and nothing downstream could tell a partial total from a real one.
 *
 * Each line is counted on the share of it that is eaten (`edibleGrams`), never on what it weighs as
 * bought: a litre of mussels is 750 g at the fishmonger and 300 g on the fork. So the `grams` this
 * returns, and every per-100 g figure read against it, are the weight of what is eaten.
 */
export const nutritionOfLines = (
  lines: WeighableLine[],
  lineCount: number,
  servings: number,
): RecipeNutrition | undefined => {
  if (lineCount === 0 || lines.length !== lineCount) return undefined;

  return totalsOf(
    lines.map(({ ingredient, quantity, unit }) => ({
      facts: ingredient.nutrition,
      grams: edibleGrams(quantity, unit, ingredient),
      produce: PRODUCE_CATEGORIES.includes(ingredient.category),
    })),
    servings,
  );
};
