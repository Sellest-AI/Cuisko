/**
 * The Marmiton filter, proven offline.
 *
 * `fixtures/search-pad-thai.html` is a real search page, saved on 2026-09-21. It holds nine cards:
 * seven recipes, two of them unreviewed, and two editorial "story" cards. Its most reviewed recipe
 * is 4.3/5 over 54 reviews and its only perfect score has 8, so nothing on it clears the bar: one
 * misses on rating, the other on reviews. The lasagna page is the opposite case, a page where the
 * question is which passing card to keep.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  bestCard,
  classifyCards,
  MARMITON_BAR,
  parseSearchResults,
  passesBar,
  searchCardsOf,
  type SearchCard,
} from "../marmiton";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

const PAD_THAI = fixture("search-pad-thai.html");
/** Page 1 of "lasagnes", saved on 2026-09-21: 15 recipes, every one of them 4.5/5 or better. */
const LASAGNES = fixture("search-lasagnes.html");

/** One search result in the shape Marmiton renders it, trimmed to what the parser reads. */
const cardHtml = ({ href, title, rating }: { href: string; title: string; rating?: [string, string] }) => `
  <li class="search-list__item">
    <div class="card-content">
      <a href="${href}" class="card-content__title line-clamp">${title}</a>
      ${
        rating
          ? `<div class="rating">
               <div class="rating__rating">${rating[0]}</div>
               <div class="rating__nbreviews">${rating[1]}</div>
             </div>`
          : ""
      }
    </div>
  </li>`;

const pageOf = (...cards: string[]) => `<html><body><ul>${cards.join("")}</ul></body></html>`;

describe("parseSearchResults", () => {
  it("reads every recipe card of a saved page, with its canonical url, title, rating and reviews", () => {
    const cards = parseSearchResults(PAD_THAI);

    expect(cards).toHaveLength(7);
    expect(cards[0]).toEqual({
      url: "https://www.marmiton.org/recettes/recette_pad-thai_11946.aspx",
      title: "Pad Thai",
      rating: 4.3,
      reviews: 54,
    });
    expect(cards[1]).toMatchObject({
      title: "Pad thaï au Poulet et nouilles sautées de Yaai Thaï",
      rating: 5,
      reviews: 8,
    });
  });

  it("normalizes titles to NFC, since the page spells one ï as i plus a combining diaeresis", () => {
    const titles = parseSearchResults(PAD_THAI).map((card) => card.title);

    expect(PAD_THAI).toContain("Tha\u0069\u0308");
    expect(titles.every((title) => title === title.normalize("NFC"))).toBe(true);
  });

  it("leaves out editorial cards, which link outside /recettes/", () => {
    const urls = parseSearchResults(PAD_THAI).map((card) => card.url);

    expect(urls.every((url) => url.startsWith("https://www.marmiton.org/recettes/recette_"))).toBe(true);
    expect(urls.some((url) => url.includes("/shopping/") || url.includes("/focus-ingredient/"))).toBe(false);
  });

  it("reads a card with no rating as unreviewed, and the bar rejects it", () => {
    const unrated = parseSearchResults(PAD_THAI).find((card) => card.title === "Pad kaprao");

    expect(unrated).toMatchObject({ rating: 0, reviews: 0 });
    expect(passesBar(unrated!)).toBe(false);
  });

  it("rejects every recipe on the saved page: each one misses one threshold or the other", () => {
    expect(parseSearchResults(PAD_THAI).filter(passesBar)).toEqual([]);
  });

  it("canonicalizes the url, so the ledger key matches the sourceUrl importOne stores", () => {
    const [card] = parseSearchResults(
      pageOf(cardHtml({ href: "/recettes/recette_x_1.aspx?utm_source=search#avis", title: "X", rating: ["5/5", "12 avis"] })),
    );

    expect(card!.url).toBe("https://www.marmiton.org/recettes/recette_x_1.aspx");
  });

  it("keeps one card per url when the page lists a recipe twice", () => {
    const card = cardHtml({ href: "/recettes/recette_x_1.aspx", title: "X", rating: ["5/5", "12 avis"] });

    expect(parseSearchResults(pageOf(card, card))).toHaveLength(1);
  });

  it("reads a French decimal comma and a thousands separator", () => {
    const [card] = parseSearchResults(
      pageOf(cardHtml({ href: "/recettes/recette_x_1.aspx", title: "X", rating: ["4,7/5", "1\u202f234 avis"] })),
    );

    expect(card).toMatchObject({ rating: 4.7, reviews: 1234 });
  });

  it("throws on a rating block it cannot read, rather than recording a false rejection", () => {
    const page = pageOf(cardHtml({ href: "/recettes/recette_x_1.aspx", title: "X", rating: ["★★★★½", "12 avis"] }));

    expect(() => parseSearchResults(page)).toThrow(/markup has probably changed/);
  });

  it("returns nothing for a page with no results", () => {
    expect(parseSearchResults(pageOf())).toEqual([]);
  });
});

/** dakgalbi, bossam, bakso: a 404 errored the dish, skipped BBC Good Food and left it unrecorded. */
describe("searchCardsOf", () => {
  it("reads a 404 as a search with no results, whatever the page says", () => {
    expect(searchCardsOf({ status: 404, html: "<html><body>Page introuvable</body></html>" })).toEqual([]);
  });

  it("reads the cards of a page that answered", () => {
    expect(searchCardsOf({ status: 200, html: LASAGNES })).toEqual(parseSearchResults(LASAGNES));
  });

  it("still throws on any other failing status", () => {
    expect(() => searchCardsOf({ status: 503, html: "" })).toThrow("503");
  });
});

describe("passesBar", () => {
  it("is inclusive on both thresholds", () => {
    expect(MARMITON_BAR).toEqual({ minReviews: 30, minRating: 4.5 });
    expect(passesBar({ rating: 4.5, reviews: 30 })).toBe(true);
  });

  it("fails just under either threshold", () => {
    expect(passesBar({ rating: 4.49, reviews: 400 })).toBe(false);
    expect(passesBar({ rating: 5, reviews: 29 })).toBe(false);
  });
});

describe("bestCard", () => {
  const card = (url: string, rating: number, reviews: number): SearchCard => ({ url, title: url, rating, reviews });

  it("keeps the most reviewed recipe of a page, which is not the first one by rating", () => {
    expect(bestCard(parseSearchResults(LASAGNES), "lasagnes")).toMatchObject({
      url: "https://www.marmiton.org/recettes/recette_lasagnes-a-la-bolognaise_18215.aspx",
      rating: 4.8,
      reviews: 1429,
    });
  });

  it("keeps the most reviewed card that names the variation searched for", () => {
    expect(bestCard(parseSearchResults(LASAGNES), "lasagnes au saumon")).toMatchObject({
      title: "Lasagnes au saumon et aux épinards",
      reviews: 351,
    });
  });

  it("returns nothing for a page where no card clears the bar", () => {
    expect(bestCard(parseSearchResults(PAD_THAI), "pad thaï")).toBeUndefined();
  });

  it("returns nothing when the cards that clear the bar are other dishes", () => {
    expect(bestCard(parseSearchResults(LASAGNES), "moussaka")).toBeUndefined();
  });

  it("never picks a card under the bar, however many reviews it has", () => {
    expect(bestCard([card("gratin 1", 4.4, 5000), card("gratin 2", 4.6, 60)], "gratin")?.url).toBe("gratin 2");
  });

  it("never picks a more reviewed card that is another dish", () => {
    const cards = [card("Madeleines au miel", 4.7, 635), card("Mafé de poulet", 4.8, 40)];

    expect(bestCard(cards, "mafé")?.url).toBe("Mafé de poulet");
  });

  it("breaks a tie on reviews by rating, then by page order", () => {
    expect(bestCard([card("gratin 1", 4.6, 80), card("gratin 2", 4.9, 80)], "gratin")?.url).toBe("gratin 2");
    expect(bestCard([card("gratin 1", 4.7, 80), card("gratin 2", 4.7, 80)], "gratin")?.url).toBe("gratin 1");
  });
});

describe("classifyCards", () => {
  it("accepts the best card, skips the others that clear the bar, and rejects the rest", () => {
    const cards = parseSearchResults(LASAGNES);
    const verdicts = classifyCards(cards, "lasagnes");
    const best = bestCard(cards, "lasagnes");

    expect(verdicts.filter((card) => card.verdict === "accepted")).toEqual([{ ...best, verdict: "accepted" }]);
    expect(verdicts.filter((card) => card.verdict === "skipped")).toHaveLength(
      cards.filter(passesBar).length - 1,
    );
    expect(verdicts.map((card) => card.url)).toEqual(cards.map((card) => card.url));
  });

  it("rejects every card of a page where nothing clears the bar", () => {
    const verdicts = classifyCards(parseSearchResults(PAD_THAI), "pad thaï");

    expect(verdicts.length).toBeGreaterThan(0);
    expect(verdicts.every((card) => card.verdict === "rejected")).toBe(true);
  });

  it("skips a passing card that names another dish, rather than rejecting it", () => {
    const cards: SearchCard[] = [{ url: "https://m.org/a", title: "Madeleines au miel", rating: 4.8, reviews: 400 }];

    expect(classifyCards(cards, "mafé")).toEqual([{ ...cards[0], verdict: "skipped" }]);
  });
});
