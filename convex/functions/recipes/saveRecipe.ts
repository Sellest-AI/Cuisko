import type { Id } from "@convex/_generated/dataModel";
import { hashText, setTranslation } from "@convex/lib/i18n";
import type { Localized } from "@convex/schema/i18n";
import type { MutationCtx } from "@convex/procedures";
import type { SanitizedRecipe } from "@convex/agent/tools/sanitizeRecipe";
import type { Locale } from "@shared/translations";
import { serializeInstructions } from "@shared/recipes";

import { deriveRecipeFields } from "./deriveRecipeFields";
import { insertRecipe } from "./insertRecipe";
import type { RecipeLink } from "./resolveRecipeIngredients";

type Args = {
  userId?: Id<"users">;
  /** The language the recipe was generated in — the only one it exists in at this point. */
  locale: Locale;
  recipe: SanitizedRecipe;
  /** What the lines resolved to, already bought by the action that called this. */
  links: RecipeLink[];
  /** The page an import came from; absent for a recipe typed by hand. */
  sourceUrl?: string;
};

/** The model wrote this text, in `locale` — not the cook's own words, so the status is `machine`. */
const _machine = (locale: Locale, value: string): Localized =>
  setTranslation(undefined, locale, value, "machine", hashText(value));

/**
 * A generated recipe into a `recipes` row plus its catalog links.
 *
 * It no longer decides which lines link: `resolveRecipeIngredients` did that in the action, where
 * a name may be looked up in a dataset, in a live API and by a model, and where a row can be
 * created for a food the catalog has never held. What still reaches here unlinked is only what the
 * resolver actively refused or could not buy — dropped from `recipeIngredients` rather than
 * guessed at, since the name is still in the instructions the cook reads and a wrong link is a
 * wrong pantry deduction later.
 *
 * The row itself is written by `insertRecipe`, the one place a `recipes` row is inserted, which
 * derives `search`, the facets and the shuffle key from what is stated here (ADR 0011).
 *
 * `sourceUrl` is canonicalized there too, as well as by the import that produced it, because a
 * client is not a gate: `createOne.authed` is callable with any string, and the column is the key a
 * later dedupe will match on, so one spelling per page has to hold at the write. Idempotent, so the
 * second pass over an already-canonical address is free. One that cannot be canonicalized is
 * stored as absent rather than refused — no real path produces one, and a case that cannot occur
 * naturally does not deserve an error path.
 */
export const saveRecipe = async (
  ctx: MutationCtx,
  { userId, locale, recipe, links, sourceUrl }: Args,
) => {
  const { tags } = await deriveRecipeFields(ctx, { recipe, links });

  return insertRecipe(ctx, {
    recipe: {
      userId,
      title: _machine(locale, recipe.title),
      description: _machine(locale, recipe.description),
      instructions: _machine(locale, serializeInstructions(recipe.instructions)),
      servings: recipe.servings,
      equipments: recipe.equipments,
      difficulty: recipe.difficulty,
      tags,
      cuisine: recipe.cuisine,
      timings: recipe.timings,
      sourceUrl,
      // Nobody has read what the model just wrote.
      status: "generated",
    },
    links,
    names: recipe.ingredients.map((line) => line.name),
  });
};
