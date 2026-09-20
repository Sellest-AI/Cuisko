import type { Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";
import { notEmpty } from "@shared/helpers";

import { type RecipeCard, toRecipeCards } from "./recipeCard";

type CardCtx = Pick<QueryCtx, "db">;

type Args = {
  ids: Id<"recipes">[];
  locale: Locale;
};

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
  { ids, locale }: Args,
): Promise<RecipeCard[]> => {
  const recipes = await Promise.all(ids.map((id) => ctx.db.get(id)));

  return toRecipeCards(ctx, recipes.filter(notEmpty), locale);
};
