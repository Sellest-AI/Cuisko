import type { Id } from "@convex/_generated/dataModel";
import { verifyRecipe } from "@convex/agent/tools/verifyRecipe";
import type { SanitizedRecipe } from "@convex/agent/tools/sanitizeRecipe";
import type { TracedActionCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";

import type { RecipeDetail } from "./loadRecipe";
import { resolveRecipeIngredients, type RecipeLink } from "./resolveRecipeIngredients";
import { toModelRecipe } from "./toModelRecipe";

type Args = {
  /** The row as `getOne._internal` returns it — loaded by the caller, not here. */
  stored: RecipeDetail;
  /** The page it was imported from, canonical — `recipes.sourceUrl`. The tool scrapes it again. */
  url: string;
  locale: Locale;
};

/**
 * What a verify decided. `rewritten` carries everything `updateOne._internal_persist` takes, so the
 * caller writes it through the same path a cook's edit does.
 */
export type Verification =
  | { verdict: "unchanged" }
  | {
    verdict: "rewritten";
    corrections: string[];
    recipe: SanitizedRecipe;
    links: RecipeLink[];
    /** See `regenerateRecipe`: a short resolve must not replace the row's links. */
    complete: boolean;
  };

/**
 * A stored recipe checked against the page it came from, and the recipe to write when it was wrong.
 *
 * Only a correction pays for a resolve. "Nothing to fix" returns before any ingredient is walked,
 * so a recipe that was imported well costs one model call and writes nothing.
 *
 * Every line is re-resolved on a rewrite, the unchanged ones included, for the reason
 * `regenerateRecipe` writes out: a line that linked before answers from the catalog's first step.
 */
export const verifyAgainstSource = async (
  ctx: TracedActionCtx & { userId?: Id<"users"> },
  { stored, url, locale }: Args,
): Promise<Verification> => {
  const { corrections, recipe } = await verifyRecipe.run(ctx, {
    locale,
    stored: toModelRecipe(stored),
    url,
  });

  if (!recipe) return { verdict: "unchanged" };

  const { links, complete } = await resolveRecipeIngredients(ctx, { recipe, locale });

  return { verdict: "rewritten", corrections, recipe, links, complete };
};
