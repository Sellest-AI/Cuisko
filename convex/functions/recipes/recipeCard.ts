import type { Doc, Id } from "@convex/_generated/dataModel";
import { getImage } from "@convex/functions/media/getImage";
import { resolvei18n } from "@convex/lib/i18n";
import type { QueryCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";
import type { Cuisine } from "@shared/cuisines";

type CardCtx = Pick<QueryCtx, "db">;

/** A recipe image as `getImage` resolves it: every size, or nothing. */
export type RecipeImage = Awaited<ReturnType<typeof getImage>>;

/**
 * A recipe as a list draws it: five fields, already in the caller's language.
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
  /**
   * The generated cover at its medium size (600px at most): a card is half the screen wide, about
   * 540px on a 3x display.
   *
   * A URL rather than the image document, for the reason the document itself stops here. Absent
   * covers "not generated yet", "both renders failed" and "the image row is gone"; the screen draws
   * its placeholder for all three.
   */
  coverImageUrl?: string;
  plateImageUrl?: string;
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

/**
 * The recipe's cover, read once.
 *
 * Separate from `toRecipeCard` so a caller that needs a second size of the same image, as
 * `loadRecipe` does for the page header, can take it from this one read instead of reading again.
 */
export const coverOf = (ctx: CardCtx, recipe: Doc<"recipes">): Promise<RecipeImage> =>
  recipe.coverImageId ? getImage(ctx, recipe.coverImageId) : Promise.resolve(null);

export const plateOf = (ctx: CardCtx, recipe: Doc<"recipes">): Promise<RecipeImage> =>
  recipe.plateImageId ? getImage(ctx, recipe.plateImageId) : Promise.resolve(null);

export const toRecipeCard = (
  recipe: Doc<"recipes">,
  locale: Locale,
  cover: RecipeImage,
  plate: RecipeImage,
): RecipeCard => ({
  id: recipe._id,
  title: resolvei18n(recipe.title, locale),
  cuisine: recipe.cuisine,
  minutes: _totalMinutes(recipe.timings),
  coverImageUrl: cover?.sizes.medium.url,
  plateImageUrl: plate?.sizes.medium.url,
});

/**
 * A list of cards, their covers read concurrently.
 *
 * An N+1 in shape, bounded by the page a list asks for rather than by the table: two reads per card,
 * the same trade `loadRecipe` makes for its ingredient thumbnails.
 */
export const toRecipeCards = (
  ctx: CardCtx,
  recipes: Doc<"recipes">[],
  locale: Locale,
): Promise<RecipeCard[]> =>
  Promise.all(recipes.map(async (recipe) => toRecipeCard(recipe, locale, await coverOf(ctx, recipe), await plateOf(ctx, recipe))));
