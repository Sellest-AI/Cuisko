import type { Doc, Id } from "@convex/_generated/dataModel";
import { getImage } from "@convex/functions/media/getImage";
import { resolvei18n } from "@convex/lib/i18n";
import type { QueryCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";
import type { Cuisine } from "@shared/cuisines";
import { notEmpty } from "@shared/helpers";
import { totalMinutesOf } from "@shared/recipes";

type CardCtx = Pick<QueryCtx, "db">;

/** A recipe image as `getImage` resolves it: every size, or nothing. */
export type RecipeImage = Awaited<ReturnType<typeof getImage>>;

/**
 * A recipe as a list draws it: five fields, already in the caller's language.
 *
 * The line this type holds is the one where the document stops travelling. A card that took a
 * `Doc<"recipes">` would ship both locales of the title and the search blob, every facet and every
 * timing, per row, per page, so that a grid could print one string. (The description and the
 * instructions do not belong to the row: they live in `recipeContents`.)
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
  minutes: totalMinutesOf(recipe.timings),
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

/**
 * A bounded list of ids → the cards a list draws, in the order they were asked for.
 *
 * **Order is preserved and it is load-bearing.** The caller is the assistant, whose ids came out of
 * `searchForUser` already ranked — the cook's own recipes first, then the ones that keep their
 * diet. Reading them back in document order would throw that ranking away silently, and the row of
 * cards would stop agreeing with the sentence above it.
 *
 * **A missing id is dropped, not an error.** Ids reach here from a tool result stored in a message,
 * so a recipe deleted between the search and the read is ordinary rather than exceptional: an old
 * conversation quietly shows one card fewer. Throwing would make a whole transcript unreadable
 * because of one deleted recipe.
 *
 * `ctx.db.get` per id rather than an index scan, because the ids ARE the query — there is no
 * predicate to put in an index (ADR 0007 is about scanning a table, and this scans nothing). It is
 * an N+1 by shape, bounded by what a tool returns, which is a handful.
 */
export const loadRecipeCards = async (
  ctx: CardCtx,
  { ids, locale }: { ids: Id<"recipes">[]; locale: Locale },
): Promise<RecipeCard[]> => {
  const recipes = await Promise.all(ids.map((id) => ctx.db.get(id)));

  return toRecipeCards(ctx, recipes.filter(notEmpty), locale);
};
