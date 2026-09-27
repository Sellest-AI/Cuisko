import { resolvei18n } from "@convex/lib/i18n";
import type { QueryCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";
import { edibleGrams, type RecipeUnit, roundQuantity, toGrams, weighableUnits } from "@shared/ingredients";
import {
  type IngredientFacts,
  type NutriScoreGrade,
  roundFacts,
  scaleFacts,
  scaleNutrition,
} from "@shared/nutrition";

import { loadRecipeLines, nutritionOfLines, type WeighableLine } from "./recipeNutrition";

type ComputeCtx = Pick<QueryCtx, "db">;

/** A line as the assistant writes it: an id it was handed, and a quantity it read or was told. */
export type LineRequest = { ingredientId: string; quantity: number; unit: RecipeUnit };

/** One line's part of the total, so "what brings the most fat" is read off, never worked out. */
export type LineShare = {
  name: string;
  quantity: number;
  unit: RecipeUnit;
  grams: number;
  calories: number;
  protein: number;
  fat: number;
  carbohydrates: number;
};

/**
 * Every figure the assistant could be asked for, already computed and rounded.
 *
 * **Deliberately redundant.** `perServing`, `total` and `per100g` are each derivable from the
 * others, and that is why all three are here: whichever the cook asks for, the model copies it. A
 * field it would have to divide to reach is a figure it would get wrong one turn in twenty.
 */
export type NutritionFigures = {
  /** The servings `grams` and `total` are for. `perServing` holds at every value of it. */
  servings: number;
  grams: number;
  total: IngredientFacts;
  perServing: IngredientFacts;
  per100g: IngredientFacts;
  nutriScore?: NutriScoreGrade;
  lines: LineShare[];
};

/**
 * A recipe's figures, or why it has none. A recipe that cannot be totalled is an answer, not an
 * error: one incomplete dish must not cost the others in the same call their figures.
 *
 * In a list carrying its `id`, never an object keyed by it: this is stored in the message
 * document, where a key is a field name, and the tools keep one shape for "one entry per thing
 * asked" (see `searchRecipes`).
 */
export type RecipeFigures = { id: string; title: string } & (NutritionFigures | { unavailable: string });

/** A line asked in a unit its ingredient cannot be weighed in, with the units it can. */
export type Unweighable = { ingredientId: string; name: string; unit: RecipeUnit; units: RecipeUnit[] };

/**
 * What the calculator found. **Problems are data here, never a throw**: the tool reading this
 * throws on them, because an `Error` thrown inside a query reaches the action as "Server Error" in
 * production, and the model needs to read WHICH id, and which units to use instead.
 */
export type NutritionAnswer =
  | { kind: "recipes"; missing: string[]; recipes: RecipeFigures[] }
  | { kind: "lines"; missing: string[]; unweighable: Unweighable[]; figures?: NutritionFigures };

type Args = {
  recipeIds?: string[];
  lines?: LineRequest[];
  /** Recipes: each one's own servings when absent. Lines: one serving when absent. */
  servings?: number;
  locale: Locale;
};

const UNAVAILABLE =
  "This recipe has an ingredient that cannot be weighed, so it has no complete nutrition. " +
  "Say so; do not estimate it.";

/**
 * The lines' figures for `wanted` servings, from a batch written for `written`.
 *
 * The total is `nutritionOfLines`' and nothing else's, so a recipe's figure here is the recipe
 * screen's figure at the same servings. The per-line shares are the only arithmetic of this file's
 * own, and they are the same `edibleGrams` × per-100 g that total is the sum of.
 *
 * Every `grams` here is the weight EATEN, the dish's and each line's, so every figure in one answer
 * obeys grams × per-100 g = total and nothing the model copies contradicts another field. What the
 * cook bought stays in each line's `quantity` and `unit`, as the recipe writes it.
 */
const _figuresOf = (
  lines: WeighableLine[],
  lineCount: number,
  { written, wanted, locale }: { written: number; wanted: number; locale: Locale },
): NutritionFigures | undefined => {
  const totals = nutritionOfLines(lines, lineCount, written);
  if (!totals) return undefined;

  const scaled = scaleNutrition(totals, written, wanted);
  const factor = wanted / written;

  return {
    servings: wanted,
    grams: Math.round(scaled.grams),
    total: roundFacts(scaled.total),
    perServing: roundFacts(scaled.perServing),
    per100g: roundFacts(scaleFacts(totals.total, 100 / totals.grams)),
    ...(totals.nutriScore && { nutriScore: totals.nutriScore.grade }),
    lines: lines.map(({ ingredient, quantity, unit }) => {
      // Defined: `totalsOf` has just refused any line `edibleGrams` could not weigh.
      const grams = (edibleGrams(quantity, unit, ingredient) ?? 0) * factor;
      const share = roundFacts(scaleFacts(ingredient.nutrition, grams / 100));

      return {
        name: resolvei18n(ingredient.name, locale),
        // The recipe screen's own rounding, so Cuisko quotes the quantity the cook reads there.
        quantity: roundQuantity(quantity * factor, unit),
        unit,
        grams: Math.round(grams),
        calories: share.calories,
        protein: share.protein,
        fat: share.fat,
        carbohydrates: share.carbohydrates,
      };
    }),
  };
};

const _recipesNutrition = async (
  ctx: ComputeCtx,
  { ids, servings, locale }: { ids: string[]; servings?: number; locale: Locale },
): Promise<NutritionAnswer> => {
  const found = await Promise.all(
    [...new Set(ids)].map(async (id) => {
      // Strings, not ids: the model carried them and may have mangled one (see `missingRecipeIds`).
      const recipeId = ctx.db.normalizeId("recipes", id);
      const recipe = recipeId ? await ctx.db.get(recipeId) : null;
      if (!recipe) return { id, figures: null };

      const { lines, lineCount } = await loadRecipeLines(ctx, recipe._id);
      const title = resolvei18n(recipe.title, locale);
      const wanted = servings ?? recipe.servings;
      const figures = recipe.servings > 0
        ? _figuresOf(lines, lineCount, { written: recipe.servings, wanted, locale })
        : undefined;

      return { id, figures: figures ? { id, title, ...figures } : { id, title, unavailable: UNAVAILABLE } };
    }),
  );

  return {
    kind: "recipes",
    missing: found.filter(({ figures }) => figures === null).map(({ id }) => id),
    recipes: found.flatMap(({ figures }) => (figures ? [figures] : [])),
  };
};

const _linesNutrition = async (
  ctx: ComputeCtx,
  { lines, servings, locale }: { lines: LineRequest[]; servings: number; locale: Locale },
): Promise<NutritionAnswer> => {
  const rows = await Promise.all(
    lines.map(async (line) => {
      const ingredientId = ctx.db.normalizeId("ingredients", line.ingredientId);

      return { line, ingredient: ingredientId ? await ctx.db.get(ingredientId) : null };
    }),
  );

  const missing: string[] = [];
  const unweighable: Unweighable[] = [];
  const weighable: WeighableLine[] = [];

  for (const { line, ingredient } of rows) {
    if (!ingredient) {
      missing.push(line.ingredientId);
    } else if (toGrams(line.quantity, line.unit, ingredient) === undefined) {
      // Weighability, not a count: `edibleGrams` refuses exactly the units `toGrams` does.
      unweighable.push({
        ingredientId: line.ingredientId,
        name: resolvei18n(ingredient.name, locale),
        unit: line.unit,
        units: weighableUnits(ingredient),
      });
    } else {
      weighable.push({ ingredient, quantity: line.quantity, unit: line.unit });
    }
  }

  if (missing.length > 0 || unweighable.length > 0) return { kind: "lines", missing, unweighable };

  const figures = _figuresOf(weighable, weighable.length, { written: servings, wanted: servings, locale });

  return { kind: "lines", missing, unweighable, ...(figures && { figures }) };
};

/**
 * The nutrition of recipes, or of lines the assistant wrote — `recipeIds` win when both are given.
 *
 * The assistant's calculator, and the reason it exists is that the model must never produce a
 * nutrition figure itself: asked "how many calories in an egg", it multiplies in its head, and
 * the answer is confident and unchecked. Here the egg is weighed by `edibleGrams` from its catalog
 * row and counted by `totalsOf`, exactly as a recipe line is.
 */
export const computeNutrition = (
  ctx: ComputeCtx,
  { recipeIds, lines, servings, locale }: Args,
): Promise<NutritionAnswer> =>
  recipeIds && recipeIds.length > 0
    ? _recipesNutrition(ctx, { ids: recipeIds, servings, locale })
    : _linesNutrition(ctx, { lines: lines ?? [], servings: servings ?? 1, locale });
