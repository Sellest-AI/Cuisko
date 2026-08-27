import type { Doc, Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";

import { type RecipeCard, toRecipeCard } from "./recipeCard";

type SearchCtx = Pick<QueryCtx, "db">;

type Args = {
  userId: Id<"users">;
  locale: Locale;
  query: string;
  limit?: number;
};

/** A search answers with its best N, not with a page — the cook narrows again rather than scrolls. */
const DEFAULT_LIMIT = 24;

/**
 * Recipes whose own name contains the term.
 *
 * A `switch` rather than a computed index name, for the reason `searchCatalog` gives: Convex types
 * the `searchField` against the index it is handed, so a third locale fails to compile here — on
 * the missing return — instead of quietly searching the English index for French words.
 *
 * `userId` is an `eq` on a `filterField`, which narrows INSIDE the index scan. That placement is
 * the whole reason it is not a `.filter()` afterwards: the scan spends its 1024-result budget on
 * this cook's recipes rather than on everyone's, so a common word like "soup" cannot exhaust the
 * budget on strangers' rows and return nothing of the caller's.
 */
const _titleMatches = (
  ctx: SearchCtx,
  term: string,
  locale: Locale,
  userId: Id<"users">,
  limit: number,
): Promise<Doc<"recipes">[]> => {
  switch (locale) {
    case "fr":
      return ctx.db
        .query("recipes")
        .withSearchIndex("search_title_fr", (q) =>
          q.search("title.values.fr", term).eq("userId", userId),
        )
        .take(limit);
    case "en":
      return ctx.db
        .query("recipes")
        .withSearchIndex("search_title_en", (q) =>
          q.search("title.values.en", term).eq("userId", userId),
        )
        .take(limit);
  }
};

/**
 * Recipes that contain the term as an ingredient — including under a name the cook did not write,
 * because the blob carries each ingredient's catalog aliases and an accent-folded copy of each.
 * That is what makes "patates" reach a recipe whose line says "pommes de terre".
 */
const _ingredientMatches = (
  ctx: SearchCtx,
  term: string,
  locale: Locale,
  userId: Id<"users">,
  limit: number,
): Promise<Doc<"recipes">[]> => {
  switch (locale) {
    case "fr":
      return ctx.db
        .query("recipes")
        .withSearchIndex("search_fr", (q) => q.search("search.fr", term).eq("userId", userId))
        .take(limit);
    case "en":
      return ctx.db
        .query("recipes")
        .withSearchIndex("search_en", (q) => q.search("search.en", term).eq("userId", userId))
        .take(limit);
  }
};

/**
 * The caller's own recipes matching a term, by name or by what is in them.
 *
 * **Two index reads, one answer, and the merge lives here rather than in the hook.** A recipe
 * called "Tomato soup" that contains tomatoes matches both indexes, so something has to decide
 * which band it belongs to and that it appears once. Doing it in React would put a ranking rule in
 * a component and make it untestable without mounting one; doing it here means `useRecipeList`
 * receives a finished list and sorts nothing.
 *
 * **Title beats ingredient**, because the two mean different things to the person typing. Someone
 * typing "lasagna" wants their lasagna recipe, not the four recipes that happen to use lasagne
 * sheets — so the name band comes first, and the ingredient band is what is offered underneath it
 * once the obvious answer has been given.
 *
 * The two reads are concurrent: they share no state and neither informs the other, so awaiting them
 * in sequence would only add the slower one to the faster one for nothing.
 *
 * An empty query returns nothing rather than the first page of the list. The caller is a box under
 * a list that is already on screen, and a cook who has typed nothing has narrowed nothing — the
 * unfiltered list is what `getAll` is for.
 */
export const searchForUser = async (
  ctx: SearchCtx,
  { userId, locale, query, limit = DEFAULT_LIMIT }: Args,
): Promise<RecipeCard[]> => {
  const term = query.trim();
  if (!term) return [];

  const [titles, ingredients] = await Promise.all([
    _titleMatches(ctx, term, locale, userId, limit),
    _ingredientMatches(ctx, term, locale, userId, limit),
  ]);

  /**
   * First occurrence wins, and the title band is concatenated first — which is how a recipe that
   * matched both ends up in the band a reader would expect rather than listed twice. A `Map` keeps
   * insertion order, so de-duplicating does not disturb the ranking it is applied to.
   */
  const ranked = new Map<string, Doc<"recipes">>();
  for (const recipe of [...titles, ...ingredients]) {
    if (!ranked.has(recipe._id)) ranked.set(recipe._id, recipe);
  }

  return [...ranked.values()].slice(0, limit).map((recipe) => toRecipeCard(recipe, locale));
};
