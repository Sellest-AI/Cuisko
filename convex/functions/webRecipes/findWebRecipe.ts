import type { FoundWebRecipe, WebRecipe } from "@shared/assistant";
import { isAppError } from "@shared/errors";

import type { Id } from "@convex/_generated/dataModel";
import { toRecipeDraft, type ScrapedRecipe } from "@convex/lib/scraping/toRecipeDraft";
import { matchesDish } from "@convex/lib/webRecipes/dishMatch";
import { httpsImageOf } from "@convex/lib/webRecipes/imageUrl";
import { parseSearchResults, type SearchCard } from "@convex/lib/webRecipes/marmiton";
import { searchUrlOf } from "@convex/lib/webRecipes/marmitonUrl";
import { bestOf, CHAT_BAR, passes } from "@convex/lib/webRecipes/verdicts";
import type { EventProperties } from "@convex/schema/events";
import type { Locale } from "@convex/schema/i18n";

/** The dish as the model named it, in both languages: the catalog is searched in the cook's, Marmiton in French. */
export type Dish = { fr: string; en: string };

/** What one search tells PostHog, as `web recipe searched`: declared with the event (`schema/events.ts`). */
export type WebRecipeSearched = EventProperties["web recipe searched"];

export type FindWebRecipeDeps = {
  /** The catalog's recipes matching `name`, ranked for this cook (`search._internal`). */
  knownByTitle?(name: string): Promise<{ id: Id<"recipes">; title: string }[]>;
  /** The search page's HTML, or `null` for Marmiton's 404: it holds no recipe of the word. */
  fetch(url: string): Promise<string | null>;
  /** One recipe page, read as Add will read it (`readRecipePage`). */
  readPage(url: string): Promise<ScrapedRecipe>;
  /** The live recipe already imported from `url`, anyone's (`findBySource._internal`). */
  knownBySource?(url: string): Promise<Id<"recipes"> | null>;
};

/** The answer, and what to report; or a failure the caller words for the model and sends to Error tracking. */
export type FindWebRecipeOutcome =
  | { result: FoundWebRecipe; event: WebRecipeSearched; error?: undefined }
  | { result?: undefined; event: WebRecipeSearched; error: unknown };

const NO_BAR = { minReviews: 0, minRating: 0 } as const;

/**
 * Recipe pages read for one search, at most: the winner, and two more when pages will not read.
 * Past that, Marmiton's recipe pages have likely changed under the scraper, and reading every card
 * on the page would cost a request each, on every question, for the same "none".
 */
const MAX_PAGES_READ = 3;

/** The card's preview of a page: the draft's fields, minus the instructions (never stored, §2). */
const _previewOf = (card: SearchCard, scraped: ScrapedRecipe): WebRecipe => {
  // Throws UNREADABLE_PAGE on a page with no ingredients or no steps: Add would refuse it too.
  const draft = toRecipeDraft(scraped);
  const imageUrl = httpsImageOf(scraped.image, card.url);

  return {
    url: card.url,
    source: "marmiton",
    title: draft.title || card.title,
    servings: draft.servings,
    ingredients: draft.ingredients.split("\n"),
    ...(imageUrl ? { imageUrl } : {}),
  };
};

const _isUnreadable = (error: unknown): boolean => isAppError(error) && error.data.code === "UNREADABLE_PAGE";

/**
 * A failed step, as Error tracking will group it: one fixed message per cause, so an outage
 * answering 503, then 502, then nothing is one issue, and so is a redesign whichever line of the
 * parser it breaks. What varied (`fetchPage`'s status, the parser's words) rides in `cause`, with the
 * original's own cause (the card it broke on) and the page's address. Never the search's address: it
 * holds the dish.
 */
// A socket error or a list as a cause would turn its fields or indices into Error tracking columns.
const _isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;

const _failureOf = (message: string, error: unknown, url?: string): Error => {
  const detail = isAppError(error) ? (error.data.message ?? error.data.code) : error instanceof Error ? error.message : String(error);
  const original = error instanceof Error && "cause" in error && _isPlainObject(error.cause) ? error.cause : {};
  return Object.assign(new Error(message), { cause: { ...original, ...(url ? { url } : {}), detail } });
};

/**
 * A recipe for `dish` the cook can add: one Cuisko already holds, or a Marmiton page that names the
 * dish and clears `CHAT_BAR`.
 *
 * 0. **Cuisko first**, by the dish's name in the cook's language, so a dish the catalog holds is
 *    answered with no request to Marmiton. A title counts when it names every word of the dish
 *    (`matchesDish`): the search also matches ingredients, and "soupe à l'oignon" would otherwise
 *    find every recipe with an onion in it.
 * 1. **Marmiton's search**, in French, its cards ranked by `bestOf` at `CHAT_BAR`.
 * 2. **The winner**: already a live recipe in Cuisko by its address → that recipe; else its page is
 *    read for the preview. A page that will not read gives way to `bestOf`'s next answer, up to
 *    `MAX_PAGES_READ` pages.
 * 3. **None** clears the bar, or none that does will read.
 *
 * Takes its fetch and its lookups as arguments, so the order of the steps, the bar and the event
 * are proven against saved pages with no network and no database (`__tests__/`).
 *
 * @limitation `matchesDish` lets a title say more than the dish: a cook holding "Pizza tartiflette"
 * who asks for a tartiflette gets the pizza as "known", and Marmiton is not asked. `knownBy: "title"`
 * makes it countable if it turns out to matter.
 *
 * ⚠️ **Reaches `cheerio` through `marmiton.ts`, so it may only ever be imported by a `"use node"`
 * action** (`router/recipes/findWebRecipe.ts`); its tests run in the `scripts` project.
 */
export const findWebRecipe = async (
  dish: Dish,
  locale: Locale,
  deps: FindWebRecipeDeps,
): Promise<FindWebRecipeOutcome> => {
  if (deps.knownByTitle) {
    const known = (await deps.knownByTitle(dish[locale])).find((recipe) => matchesDish(recipe.title, dish[locale]));
    if (known) {
      return {
        result: { v: 1, status: "known", recipeId: known.id },
        event: { outcome: "known", knownBy: "title", recipeId: known.id },
      };
    }
  }

  // No word to search by: nothing on Marmiton can name it (`matchesDish`), so no request is spent.
  if (!dish.fr.trim()) return { result: { v: 1, status: "none" }, event: { outcome: "none", candidates: 0 } };

  let html: string | null;
  try {
    html = await deps.fetch(searchUrlOf(dish.fr));
  } catch (error) {
    return { event: { outcome: "failed", reason: "unreachable" }, error: _failureOf("Marmiton's search page did not answer", error) };
  }

  let cards: SearchCard[];
  try {
    cards = html === null ? [] : parseSearchResults(html);
  } catch (error) {
    // A page that answered and does not parse: Marmiton's markup changed.
    return { event: { outcome: "failed", reason: "parse" }, error: _failureOf("Marmiton's search page could not be parsed", error) };
  }

  const candidates = cards.filter((card) => matchesDish(card.title, dish.fr)).length;
  let remaining = cards;
  let unreadable = 0;

  for (
    let winner = bestOf(remaining, dish.fr, CHAT_BAR);
    winner && unreadable < MAX_PAGES_READ;
    winner = bestOf(remaining, dish.fr, CHAT_BAR)
  ) {
    const { rating, reviews } = winner;

    const recipeId = await deps.knownBySource?.(winner.url);
    if (recipeId) {
      return {
        result: { v: 1, status: "known", recipeId },
        event: { outcome: "known", knownBy: "source", recipeId, rating, reviews, candidates },
      };
    }

    try {
      const recipe = _previewOf(winner, await deps.readPage(winner.url));
      return {
        result: { v: 1, status: "found", recipe },
        event: { outcome: "found", rating, reviews, candidates },
      };
    } catch (error) {
      if (!_isUnreadable(error)) {
        return {
          event: { outcome: "failed", reason: "unreachable" },
          error: _failureOf("A Marmiton recipe page did not answer", error, winner.url),
        };
      }
      const unread = winner;
      remaining = remaining.filter((card) => card !== unread);
      unreadable += 1;
    }
  }

  const nearest = bestOf(
    cards.filter((card) => !passes(card, CHAT_BAR)),
    dish.fr,
    NO_BAR,
  );

  return {
    result: { v: 1, status: "none" },
    event: {
      outcome: "none",
      candidates,
      ...(nearest ? { nearestMissUrl: nearest.url, nearestMissRating: nearest.rating, nearestMissReviews: nearest.reviews } : {}),
      ...(unreadable > 0 ? { unreadable } : {}),
    },
  };
};
