import type { MutationCtx } from "@convex/procedures";
import { isCookingFat } from "@shared/ingredients";

import type { RecipeLink } from "./resolveRecipeIngredients";

/**
 * The links with `fatUse` kept only where the line's ingredient is a cooking fat (`isCookingFat`).
 *
 * The model tags a line by reading the steps, and nothing stops it tagging the carrot it fried in
 * the oil rather than the oil. Counting already ignores such a tag (`eatenGrams`); dropping it here
 * keeps it out of the table too, so a row read on the dashboard says what the count does. The line
 * itself is kept whole: only the tag was wrong.
 *
 * Called by the two writers of a line's content — `insertRecipe` and `syncRecipeLinks` — so every
 * path that saves a line from the model passes through it. Only the tagged lines' rows are read,
 * which on most recipes is none.
 *
 * `replaceInRecipes` repoints a line without it, on purpose: it corrects a badly resolved row with
 * its like (one oil for another, butter for butter), so the tag stays true. Were a tagged line ever
 * moved onto a non-fat, `eatenGrams` would still ignore the tag.
 */
export const keepCookingFatUses = async (ctx: Pick<MutationCtx, "db">, links: RecipeLink[]): Promise<RecipeLink[]> =>
  Promise.all(
    links.map(async (link) => {
      if (!link.fatUse) return link;

      const ingredient = await ctx.db.get(link.ingredientId);
      if (ingredient && isCookingFat(ingredient)) return link;

      const { fatUse: _dropped, ...untagged } = link;
      return untagged;
    }),
  );
