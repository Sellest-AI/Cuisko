import type { SearchFilter, SearchFilterFinalizer } from "convex/server";

import type { Doc, Id } from "@convex/_generated/dataModel";
import { getForUser as getPreferences } from "@convex/functions/preferences/getForUser";
import type { QueryCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";

import { type DietFacets, dietFacetOf } from "./dietFacet";
import { type RecipeCard, toRecipeCards } from "./recipeCard";

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
 * What one index scan is narrowed to, inside the scan. Both absent is the whole catalog: the
 * cook's own, the seeded rows with no `userId`, and every other cook's alike.
 */
type Scope = {
  userId?: Id<"users">;
  facet?: keyof DietFacets;
};

/** The narrowing every index below accepts; the search field differs per index, the filters do not. */
type Narrowable = SearchFilterFinalizer<
  Doc<"recipes">,
  { searchField: string; filterFields: "userId" | keyof DietFacets }
>;

/**
 * Each `eq` is a `filterField` and narrows INSIDE the index scan. That placement is the whole
 * reason it is not a `.filter()` afterwards: the scan spends its 1024-result budget on the rows
 * that qualify rather than on everyone's, so a common word like "soup" cannot exhaust the budget
 * on strangers' omnivore rows and return nothing of the caller's, or nothing vegan.
 */
const _narrow = (filter: Narrowable, { userId, facet }: Scope): SearchFilter => {
  let narrowed = filter;

  if (userId) narrowed = narrowed.eq("userId", userId);
  if (facet) narrowed = narrowed.eq(facet, true);

  return narrowed;
};

/**
 * Recipes whose own name contains the term.
 *
 * A `switch` rather than a computed index name, for the reason `searchCatalog` gives: Convex types
 * the `searchField` against the index it is handed, so a third locale fails to compile here — on
 * the missing return — instead of quietly searching the English index for French words.
 */
const _titleMatches = (
  ctx: SearchCtx,
  term: string,
  locale: Locale,
  scope: Scope,
  limit: number,
): Promise<Doc<"recipes">[]> => {
  switch (locale) {
    case "fr":
      return ctx.db
        .query("recipes")
        .withSearchIndex("search_title_fr", (q) => _narrow(q.search("title.values.fr", term), scope))
        .take(limit);
    case "en":
      return ctx.db
        .query("recipes")
        .withSearchIndex("search_title_en", (q) => _narrow(q.search("title.values.en", term), scope))
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
  scope: Scope,
  limit: number,
): Promise<Doc<"recipes">[]> => {
  switch (locale) {
    case "fr":
      return ctx.db
        .query("recipes")
        .withSearchIndex("search_fr", (q) => _narrow(q.search("search.fr", term), scope))
        .take(limit);
    case "en":
      return ctx.db
        .query("recipes")
        .withSearchIndex("search_en", (q) => _narrow(q.search("search.en", term), scope))
        .take(limit);
  }
};

/**
 * One band of the answer: the two reads that fill it, title matches first.
 *
 * Concurrent, because they share no state and neither informs the other — awaiting them in
 * sequence would only add the slower one to the faster one for nothing.
 */
const _band = async (ctx: SearchCtx, term: string, locale: Locale, scope: Scope, limit: number) => {
  const [titles, ingredients] = await Promise.all([
    _titleMatches(ctx, term, locale, scope, limit),
    _ingredientMatches(ctx, term, locale, scope, limit),
  ]);

  return [...titles, ...ingredients];
};

/**
 * The scans that make up an answer, in the order their rows are ranked.
 *
 * The cook's own recipes come before everyone else's, and inside each of those the recipes that
 * keep the cook's diet come before the ones that do not. So a vegan cook is offered their own
 * omelette above a stranger's vegan curry: they wrote it, and a search is not a diet filter — the
 * chicken curry is still returned, ranked last, for the cook who typed "curry" and meant it.
 *
 * Two scopes rather than four for a cook who eats anything: every recipe suits them, so the
 * diet-narrowed scan would read the same rows as the wider one and add nothing but the read.
 *
 * The "own" scans are separate scans and not a partition of the wide one, for the same reason the
 * diet is a `filterField`: a wide scan can spend its whole budget on other cooks' rows, and the
 * caller's own lasagna must be found whatever the catalog holds.
 */
const _scopes = (userId: Id<"users">, facet: keyof DietFacets | null): Scope[] =>
  facet
    ? [{ userId, facet }, { userId }, { facet }, {}]
    : [{ userId }, {}];

/**
 * Every recipe matching a term — the caller's, the seeded catalog's, and other cooks' — ranked for
 * the caller: by name or by what is in them, their own first, the ones that keep their diet next.
 *
 * **Several index reads, one answer, and the merge lives here rather than in the hook.** A recipe
 * called "Tomato soup" that contains tomatoes matches both indexes, and the cook's own vegan soup
 * matches all four scopes, so something has to decide which band it belongs to and that it appears
 * once. Doing it in React would put a ranking rule in a component and make it untestable without
 * mounting one; doing it here means `useRecipeList` receives a finished list and sorts nothing.
 *
 * **Title beats ingredient inside a band**, because the two mean different things to the person
 * typing. Someone typing "lasagna" wants their lasagna recipe, not the four recipes that happen to
 * use lasagne sheets — so the name matches come first, and the ingredient matches are what is
 * offered underneath once the obvious answer has been given.
 *
 * The diet is the caller's own stored preference, read here rather than passed up: a ranking
 * cannot be spoofed into anything worse than a different order, and a missing row means "never
 * asked", which ranks as eating anything.
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

  const preferences = await getPreferences(ctx, userId);
  const facet = dietFacetOf(preferences?.diet ?? "omnivore");

  const bands = await Promise.all(
    _scopes(userId, facet).map((scope) => _band(ctx, term, locale, scope, limit)),
  );

  /**
   * First occurrence wins, and the bands are concatenated in rank order — which is how a recipe
   * that matched several ends up in the band a reader would expect rather than listed twice. A
   * `Map` keeps insertion order, so de-duplicating does not disturb the ranking it is applied to.
   */
  const ranked = new Map<string, Doc<"recipes">>();
  for (const recipe of bands.flat()) {
    if (!ranked.has(recipe._id)) ranked.set(recipe._id, recipe);
  }

  /** Covers are read after the cut, so a match that does not make the list costs no image read. */
  return toRecipeCards(ctx, [...ranked.values()].slice(0, limit), locale);
};
