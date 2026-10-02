import type { Doc, Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";
import { plateOf, toRecipeCard, type RecipeCard } from "@convex/functions/recipes/recipeCard";
import { loadRecipeLines, nutritionOfLines, withCuiScore } from "@convex/functions/recipes/recipeNutrition";
import type { RecipeNutrition } from "@shared/nutrition";
import { PERIOD_DAYS, summarizeWeek, type SummaryPlate, type WeekSummary } from "@shared/weekSummary";

type Args = {
  householdId: Id<"households">;
  locale: Locale;
};

/**
 * How many cooked plates are read: two slots a day, over the period and the one before it.
 *
 * @limitation Design choice, for now: a day holding more than one plate per slot uses up the budget
 * faster, and the previous period then covers fewer than `PERIOD_DAYS` days.
 */
const PLATES_READ = 2 * 2 * PERIOD_DAYS;

type SummaryRecipe = { card: RecipeCard; nutrition?: RecipeNutrition };

/**
 * Every distinct recipe on these plates, as a card and its nutrition, read once: a week repeats
 * dishes, and the lines behind a total are the expensive read.
 */
const _summaryRecipes = async (ctx: Pick<QueryCtx, "db">, plates: Doc<"plannedMeals">[], locale: Locale) => {
  const recipeIds = [...new Set(plates.map((plate) => plate.recipeId))];

  return new Map(
    await Promise.all(recipeIds.map(async (recipeId): Promise<[Id<"recipes">, SummaryRecipe]> => {
      const recipe = await ctx.db.get(recipeId);
      // The cascade deletes a recipe's planned meals with it, so this is a broken invariant, not a gap.
      if (!recipe) throw new Error(`Recipe not found: ${recipeId}`);

      const [plate, { lines, lineCount }] = await Promise.all([plateOf(ctx, recipe), loadRecipeLines(ctx, recipeId)]);

      return [recipeId, {
        card: toRecipeCard(recipe, locale, null, plate),
        nutrition: withCuiScore(nutritionOfLines(lines, lineCount, recipe.servings), recipeId),
      }];
    })),
  );
};

/**
 * The household's week summary: its latest cooked plates, joined to their recipes, handed to
 * `summarizeWeek`, which owns every figure. Only `cooked` plates are read — a planned plate was not
 * eaten, and a skipped one was not either.
 */
export const weekSummary = async (ctx: Pick<QueryCtx, "db">, { householdId, locale }: Args): Promise<WeekSummary> => {
  const cooked = await ctx.db
    .query("plannedMeals")
    .withIndex("by_household_and_status_and_date", (q) => q.eq("householdId", householdId).eq("status", "cooked"))
    .order("desc")
    .take(PLATES_READ);

  const recipes = await _summaryRecipes(ctx, cooked, locale);

  return summarizeWeek(cooked.map((plate): SummaryPlate => {
    // Built from these same plates just above, so every plate's recipe is in it.
    const { card, nutrition } = recipes.get(plate.recipeId)!;
    // The plate photo, seen from above: the row draws dishes, not covers.
    const imageUrl = card.plateImageUrl;

    return {
      plateId: plate._id,
      recipeId: plate.recipeId,
      title: card.title,
      date: plate.date,
      slot: plate.slot,
      updatedAt: plate.updatedAt,
      ...(imageUrl !== undefined && { imageUrl }),
      ...(nutrition?.cuiScore !== undefined && { cuiScore: nutrition.cuiScore }),
      ...(nutrition && { perServing: nutrition.perServing }),
    };
  }));
};
