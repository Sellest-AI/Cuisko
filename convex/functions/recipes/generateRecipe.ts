import type { Id } from "@convex/_generated/dataModel";
import { sanitizeRecipe, type SanitizedRecipe } from "@convex/agent/tools/sanitizeRecipe";
import type { ActionCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";

import { resolveRecipeIngredients, type RecipeLink } from "./resolveRecipeIngredients";

type Args = {
  locale: Locale;
  title?: string;
  description?: string;
  servings: number;
  /** The cook's free text, one ingredient per line — split here, not by the caller. */
  ingredients: string;
  instructions: string;
};

/**
 * The cook's free text, turned into everything the insert needs: a recipe in one language, and the
 * catalog row each of its lines belongs to.
 *
 * The two halves are here together because neither may run in the mutation and both must run
 * before it. Sanitizing is a model call. Resolving may reach two shipped datasets, two live APIs
 * and a model again, and may create a catalog row for a food we have never held — which is the
 * whole point: a line naming an unknown food used to be dropped silently, leaving the recipe with
 * no nutrition for it, no grocery line and no pantry deduction.
 *
 * `servings` is the cook's number, not the model's: it was stated on the form, so a generation that
 * rounded it is overwritten rather than trusted.
 */
export const generateRecipe = async (
  ctx: ActionCtx & { userId: Id<"users"> },
  { locale, title, description, servings, ingredients, instructions }: Args,
): Promise<{ recipe: SanitizedRecipe; links: RecipeLink[] }> => {
  const sanitized = await sanitizeRecipe.run(ctx, {
    locale,
    title,
    description,
    servings,
    ingredients: ingredients.split("\n").map((line) => line.trim()).filter(Boolean),
    instructions,
    outdated: null,
  });

  const recipe = { ...sanitized, servings };

  // `complete` is read and discarded, and only a create may do that: there are no links yet to
  // lose, so a line left unanswered by a failed walk is simply unlinked — exactly what an unmatched
  // name produced before this slice. `regenerateRecipe` must not, and does not.
  const { links } = await resolveRecipeIngredients(ctx, { recipe, locale });

  return { recipe, links };
};
