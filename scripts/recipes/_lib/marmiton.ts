/**
 * Reading a Marmiton search page, and deciding which of its recipes are worth importing.
 *
 * Offline by design: this file takes HTML and returns cards. The fetch, the throttle and the ledger
 * belong to the script that calls it, so everything that decides what gets imported can be proven
 * against a saved page (`__tests__/fixtures/`), without a request.
 */
import { load } from "cheerio";

import { canonicalUrlOf } from "@shared/urls";

import { matchesDish } from "./dishMatch";

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

export type SearchCard = {
  /** Canonical, via `canonicalUrlOf`: the spelling `importOne` stores as `sourceUrl`. */
  url: string;
  title: string;
  /** Out of 5. 0 when the card shows no rating, which Marmiton does for an unreviewed recipe. */
  rating: number;
  /** Marmiton's "avis". 0 when the card shows none. */
  reviews: number;
};

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
export const passesBar = (card: Pick<SearchCard, "rating" | "reviews">): boolean =>
  card.reviews >= MARMITON_BAR.minReviews && card.rating >= MARMITON_BAR.minRating;

/**
 * The one recipe a search for `dish` contributes: among the cards that clear the bar AND name the
 * dish (`matchesDish`), the one with the most reviews.
 *
 * One search, one recipe. A page is ranked for relevance and popularity, not quality, and a
 * popular dish fills it with near-copies ("bolognaise", "bolognaise très facile", "bolognaise
 * express"). Variations come from searching the variation by name, not from taking more of the page.
 *
 * The title check comes first because the search is fuzzy: without it, "mafé" keeps "Madeleines au
 * miel", the most reviewed card on its page.
 *
 * Most reviews rather than best rating, since everything here has already cleared the rating bar
 * and a 4.9 over 57 reviews says less than a 4.8 over 1,429. Ties go to the higher rating, then to
 * page order. `undefined` when no card both clears the bar and names the dish.
 */
export const bestCard = (cards: readonly SearchCard[], dish: string): SearchCard | undefined =>
  cards
    .filter((card) => passesBar(card) && matchesDish(card.title, dish))
    .reduce<SearchCard | undefined>(
      (best, card) =>
        !best ||
          card.reviews > best.reviews ||
          (card.reviews === best.reviews && card.rating > best.rating)
          ? card
          : best,
      undefined,
    );
