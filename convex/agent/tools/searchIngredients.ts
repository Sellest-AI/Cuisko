import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { type RecipeUnit, weighableUnits } from "@shared/ingredients";
import { type IngredientFacts, type NutriScoreGrade, roundFacts } from "@shared/nutrition";
import type { Locale } from "@shared/translations";
import z from "zod/v4";

import { createTool } from "../utils";

/**
 * The ingredient catalog, as the assistant reaches it: a few names in, the matching rows out, each
 * with what the calculator needs to weigh it.
 *
 * Built like `searchRecipes`, several names per call and a list of `{ query, ingredients }` back,
 * for the same two reasons: the model thinks in alternatives ("oeuf", "blanc d'oeuf"), and a
 * name is no field name for Convex to store ("oeuf" is fine, "pâtes" is not ASCII).
 *
 * **`per100g` is the row as stored, and the only nutrition figure this tool hands out.** The
 * catalog keeps every fact per 100 g, so there is nothing to compute: the model may quote it, as a
 * figure per 100 g, and must send any other quantity to `computeNutrition`. The label is in the
 * field name so that rule is visible at the moment the model reads the number.
 *
 * `units` is what makes that second call succeed the first time: "an egg" goes to the calculator
 * as `pcs` only because this said the egg can be weighed in pieces.
 */

/** Fewer than the recipes' five: a name matches one ingredient, and the rest are near misses. */
const SEARCH_LIMIT = 3;

/** How many names one call may search. */
const MAX_QUERIES = 5;

const _inputSchema = z.object({
  queries: z
    .array(z.string().min(1))
    .min(1)
    .max(MAX_QUERIES)
    .describe(
      "The names of the INGREDIENTS to look up, one per entry, as a shop would call them " +
      "([\"oeuf\", \"lentilles\"]).",
    ),
});

export type FoundIngredient = {
  id: Id<"ingredients">;
  name: string;
  /** The units `computeNutrition` can weigh this ingredient in. */
  units: RecipeUnit[];
  /** The facts for 100 g, exactly as the catalog stores them, rounded. Never for any other amount. */
  per100g: IngredientFacts;
  nutriScore?: NutriScoreGrade;
};

/** For each name searched, the ingredients it found, best match first. */
export type FoundIngredients = { query: string; ingredients: FoundIngredient[] }[];

type Caller = {
  /** The language the app is displaying, which decides which name index is searched. */
  locale: Locale;
};

/** A factory, for the reason `searchRecipesTool` is one: the locale is not the model's to state. */
export const searchIngredientsTool = ({ locale }: Caller) =>
  createTool({
    description:
      "Looks up ingredients in this app's catalog, several names at once, and returns for each " +
      "name the matching ingredients: their id, the units they can be weighed in, and their " +
      "nutrition per 100 g. For any other amount, pass the id to computeNutrition; never work a " +
      "figure out yourself.",
    inputSchema: _inputSchema,
    execute: async (ctx, { queries }): Promise<FoundIngredients> => {
      // A name the model repeats, or pads with spaces, would be the same read twice.
      const terms = [...new Set(queries.map((query) => query.trim()))].filter(Boolean);

      return Promise.all(
        terms.map(async (query) => {
          const rows = await ctx.runQuery(internal.router.ingredients.search._internal, {
            query,
            locale,
            limit: SEARCH_LIMIT,
          });

          return {
            query,
            ingredients: rows.map((row): FoundIngredient => ({
              id: row._id,
              name: row.name,
              units: weighableUnits(row),
              per100g: roundFacts(row.nutrition),
              ...(row.nutriScore && { nutriScore: row.nutriScore.grade }),
            })),
          };
        }),
      );
    },
  });
