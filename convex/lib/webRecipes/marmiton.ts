/**
 * Reading a Marmiton search page, and deciding which of its recipes are worth importing.
 *
 * Offline by design: this file takes HTML and returns cards. The fetch, the throttle and the ledger
 * belong to the script that calls it, so everything that decides what gets imported can be proven
 * against a saved page (`__tests__/fixtures/`), without a request.
 *
 * ⚠️ **This module reaches `cheerio`, so inside `convex/` it may only ever be imported by a `"use
 * node"` action.** Import it from an edge-runtime function and that function stops deploying, with
 * an error naming a Node built-in rather than this line. The catalog script (`seed:catalog`) runs it
 * under Node too. For the same reason its tests run in the `scripts` Vitest project, not `convex`.
 */
import { load } from "cheerio";

import { canonicalUrlOf } from "@shared/urls";

import { bestOf, classify, passes, type RatedRecipe, type Verdict } from "./verdicts";

const MARMITON_ORIGIN = "https://www.marmiton.org";

/** A recipe page's path. The search also returns editorial pages (`/shopping/`, `/focus-ingredient/`). */
const RECIPE_PATH = /^\/recettes\/recette_/;

/**
 * The import filter, and nothing else: no surface shows a Marmiton score (docs/PRODUCT.md).
 *
 * One constant so it can be raised later and re-applied to the ledger, which records both numbers
 * for every card it has seen, without fetching a page again.
 */
export const MARMITON_BAR = { minReviews: 30, minRating: 4.5 } as const;

export type SearchCard = RatedRecipe;

/** "4.3/5" → 4.3. A French "4,3/5" reads the same. */
const _ratingOf = (text: string): number | undefined => {
  const match = /^(\d+(?:[.,]\d+)?)\s*\/\s*5$/.exec(text);

  return match ? Number(match[1]!.replace(",", ".")) : undefined;
};

/** "54 avis" → 54. "1 234 avis", with a regular or no-break space as the thousands separator → 1234. */
const _reviewsOf = (text: string): number | undefined => {
  const match = /^([\d\s  ]+)\s*avis$/i.exec(text);

  return match ? Number(match[1]!.replace(/\D/g, "")) : undefined;
};

/**
 * The cards a search answered with, from its HTTP status and page.
 *
 * Marmiton answers a search for a word it holds no recipe of ("dakgalbi", "bakso") with a 404, not
 * an empty results page. That is no results: the dish is recorded, and BBC Good Food is looked up
 * for it. Read as an error, it skipped both, and the dish, never recorded, was proposed again.
 * Any other failing status is still an error.
 */
export const searchCardsOf = ({ status, html }: { status: number; html: string }): SearchCard[] => {
  if (status === 404) return [];
  if (status < 200 || status >= 300) throw new Error(`www.marmiton.org answered ${status} to a search`);

  return parseSearchResults(html);
};

/**
 * Every recipe card on a search results page, in page order, editorial cards left out.
 *
 * A card with no rating block is a recipe nobody has reviewed yet, so it is read as 0 and 0 and the
 * bar rejects it. A rating block that IS there but does not parse throws instead: it means the markup
 * changed, and reading it as 0 would record every recipe of the run as rejected, and the ledger
 * would keep those false rejections.
 */
export const parseSearchResults = (html: string): SearchCard[] => {
  const $ = load(html);
  const cards = new Map<string, SearchCard>();

  $("li.search-list__item").each((_, item) => {
    const link = $(item).find("a.card-content__title").first();
    const href = link.attr("href");
    if (!href) return;

    const target = new URL(href, MARMITON_ORIGIN);
    if (target.origin !== MARMITON_ORIGIN || !RECIPE_PATH.test(target.pathname)) return;

    const url = canonicalUrlOf(target.href);
    if (!url || cards.has(url)) return;

    // NFC because Marmiton's own titles mix spellings: the fixture's "Thaï" is an `i` followed by a
    // combining diaeresis, which compares unequal to the same word typed, and titles are compared
    // when they are handed to the agent as dishes to avoid.
    const title = link.text().replace(/\s+/g, " ").trim().normalize("NFC");
    const ratingText = $(item).find(".rating__rating").first().text().trim();
    const reviewsText = $(item).find(".rating__nbreviews").first().text().trim();

    const rating = ratingText ? _ratingOf(ratingText) : 0;
    const reviews = reviewsText ? _reviewsOf(reviewsText) : 0;
    if (rating === undefined || reviews === undefined) {
      throw new Error(
        `Marmiton card "${title}" (${url}) has a rating block this parser cannot read: ` +
        `"${ratingText}" / "${reviewsText}". The markup has probably changed.`,
      );
    }

    cards.set(url, { url, title, rating, reviews });
  });

  return [...cards.values()];
};

/** Whether a card clears `MARMITON_BAR`. Both thresholds are inclusive. */
export const passesBar = (card: Pick<SearchCard, "rating" | "reviews">): boolean => passes(card, MARMITON_BAR);

/** The one recipe a Marmiton search for `dish` contributes (`bestOf`, at `MARMITON_BAR`). */
export const bestCard = (cards: readonly SearchCard[], dish: string): SearchCard | undefined =>
  bestOf(cards, dish, MARMITON_BAR);

/** Every card of one Marmiton search with its verdict (`classify`, at `MARMITON_BAR`). */
export const classifyCards = (cards: readonly SearchCard[], dish: string): (SearchCard & { verdict: Verdict })[] =>
  classify(cards, dish, MARMITON_BAR);
