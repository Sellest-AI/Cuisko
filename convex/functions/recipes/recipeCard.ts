import type { Doc, Id } from "@convex/_generated/dataModel";
import { resolvei18n } from "@convex/lib/i18n";
import type { Locale } from "@convex/schema/i18n";
import type { Cuisine } from "@shared/cuisines";

/**
 * A recipe as a list draws it: four fields, already in the caller's language.
 *
 * The line this type holds is the one where the document stops travelling. A card that took a
 * `Doc<"recipes">` would ship both locales of the title, the description, the instructions and the
 * search blob — several kilobytes per row, per page — so that a grid could print one string.
 *
 * `cuisine` is the exception, and deliberately: it stays a key rather than becoming a word, because
 * the vocabulary is locale-free by design (see @shared/cuisines) and the screen already owns a
 * translation table. Resolving it here would put French in a field whose whole point is that it
 * holds no language.
 */
export type RecipeCard = {
  id: Id<"recipes">;
  title: string;
  cuisine: Cuisine;
  /** Preparation, cooking and resting added up. Absent when the recipe declares none of the three. */
  minutes?: number;
};

/**
 * The three timings as one number, because a card has room for one.
 *
 * Absent rather than zero when nothing is known: a card shows "—" for the first and "0 min" for
 * the second, and a recipe whose timings the model never filled in has not been declared instant.
 * A partial recipe still totals what it has — half an answer beats no answer on a card this small.
 */
const _totalMinutes = (timings: Doc<"recipes">["timings"]) => {
  const declared = [timings.preparation, timings.cooking, timings.resting].filter(
    (minutes) => minutes !== undefined,
  );

  return declared.length > 0 ? declared.reduce((total, minutes) => total + minutes, 0) : undefined;
};

export const toRecipeCard = (recipe: Doc<"recipes">, locale: Locale): RecipeCard => ({
  id: recipe._id,
  title: resolvei18n(recipe.title, locale),
  cuisine: recipe.cuisine,
  minutes: _totalMinutes(recipe.timings),
});
