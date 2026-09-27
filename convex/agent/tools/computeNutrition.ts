import { internal } from "@convex/_generated/api";
import type {
  NutritionAnswer,
  NutritionFigures,
  RecipeFigures,
} from "@convex/functions/recipes/computeNutrition";
import { RECIPE_UNITS } from "@shared/ingredients";
import { MAX_SERVINGS, MIN_SERVINGS } from "@shared/servings";
import type { Locale } from "@shared/translations";
import z from "zod/v4";

import { createTool } from "../utils";

/**
 * The assistant's calculator: every nutrition figure Cuisko gives comes out of here.
 *
 * **The model reads numbers; it never makes them.** Asked "how many calories in an egg", a model
 * multiplies in its head, and the answer is confident, unchecked and a little wrong in a way nobody
 * notices until they do. So the model hands this QUANTITIES ("1 egg" is `{ id, 1, "pcs" }`), the
 * egg is weighed from its catalog row by `edibleGrams` and counted by `totalsOf`, exactly as a recipe
 * line is, and every figure it could be asked for comes back computed and rounded: total, per
 * serving, per 100 g, and each line's share. Nothing in the output needs a division to reach.
 *
 * A recipe is counted by the same function the recipe screen reads (`nutritionOfLines`), so the
 * figure Cuisko quotes is the figure the cook finds when they open the dish.
 */

/** As many recipes as a turn could reasonably compare. */
const MAX_RECIPES = 5;

/** Longer than any recipe the catalog holds; a model listing more is listing a week, not a dish. */
const MAX_LINES = 30;

const _inputSchema = z.object({
  recipeIds: z
    .array(z.string())
    .min(1)
    .max(MAX_RECIPES)
    .optional()
    .describe("Recipe ids from searchRecipes, copied exactly. When given, lines are ignored."),
  lines: z
    .array(
      z.object({
        ingredientId: z.string().describe("An ingredient id from searchIngredients, copied exactly."),
        quantity: z.number().positive(),
        unit: z.enum(RECIPE_UNITS).describe("One of the units searchIngredients listed for it."),
      }),
    )
    .min(1)
    .max(MAX_LINES)
    .optional()
    .describe("Ingredients and their quantities, for anything that is not a whole recipe."),
  servings: z
    .number()
    .int()
    .min(MIN_SERVINGS)
    .max(MAX_SERVINGS)
    .optional()
    .describe(
      "How many people. For recipes, the total is given for this many; leave it out for the " +
      "servings each recipe is written for. For lines, how many people they feed; 1 if left out.",
    ),
});

type Input = z.infer<typeof _inputSchema>;

/** What the model reads back. One entry per recipe, in a list, for the reason `searchRecipes` gives. */
export type NutritionOutput = { recipes: RecipeFigures[] } | { lines: NutritionFigures };

/**
 * The figures, or the error the model has to act on.
 *
 * Pure, so the rule it enforces is pinned with no model and no database: a bad id THROWS, naming
 * it (ADR 0010), and so does a unit the ingredient cannot be weighed in, naming the units it can.
 * A throw is what the model reads and retries from; a figure computed without the line it could
 * not weigh would be a wrong number delivered with confidence, which is the thing this tool exists
 * to prevent.
 */
export const toNutritionOutput = (answer: NutritionAnswer): NutritionOutput => {
  if (answer.missing.length > 0) {
    throw new Error(
      `These ids do not exist: ${answer.missing.join(", ")}. ` +
      "Pass only ids a search returned in this conversation, copied exactly.",
    );
  }

  if (answer.kind === "recipes") return { recipes: answer.recipes };

  if (answer.unweighable.length > 0) {
    const refusals = answer.unweighable.map(
      ({ name, unit, units }) => `${name} cannot be weighed in ${unit}; use one of ${units.join(", ")}`,
    );
    throw new Error(`${refusals.join(". ")}. Call again with those units.`);
  }

  if (!answer.figures) throw new Error("These quantities weigh nothing. Give each line a real amount.");

  return { lines: answer.figures };
};

type Caller = {
  /** The language ingredient and recipe names come back in. */
  locale: Locale;
};

/** A factory, for the reason `searchRecipesTool` is one: the locale is not the model's to state. */
export const computeNutritionTool = ({ locale }: Caller) =>
  createTool({
    description:
      "Computes nutrition from the catalog: calories, protein, fat, carbohydrates, sugars, fiber, " +
      "sodium (mg) and iron (mg), for whole recipes or for ingredients in given quantities. Returns the total, " +
      "per serving, per 100 g and each ingredient's share, already rounded. Every nutrition number " +
      "you give must come from here, copied as it is.",
    inputSchema: _inputSchema,
    execute: async (ctx, { recipeIds, lines, servings }: Input): Promise<NutritionOutput> => {
      if (!recipeIds && !lines) throw new Error("Pass recipeIds, or lines of ingredients.");

      const answer = await ctx.runQuery(internal.router.recipes.computeNutrition._internal, {
        recipeIds,
        lines,
        servings,
        locale,
      });

      return toNutritionOutput(answer);
    },
  });
