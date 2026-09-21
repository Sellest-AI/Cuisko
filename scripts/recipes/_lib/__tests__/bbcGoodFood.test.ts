/**
 * BBC Good Food, proven offline.
 *
 * The recipe fixtures are real pages saved on 2026-09-21, trimmed to the one element the parser
 * reads (`#__POST_CONTENT__`), which is what keeps them small enough to commit. Bibimbap is rated
 * 4.25 over 8; vegan shepherd's pie 4.1 over 142, which the bar rejects on rating; basbousa is new
 * and unrated. The sitemaps are the index and one quarter's recipe sitemap, saved the same day.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  BBC_BAR,
  candidatesFor,
  classifyPages,
  parseRecipePage,
  recipeSitemapsOf,
  recipeUrlsOf,
  type RecipePage,
} from "../bbcGoodFood";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const page = (slug: string) =>
  parseRecipePage(fixture(`bbc-${slug}.html`), `https://www.bbcgoodfood.com/recipes/${slug}`);

describe("recipeSitemapsOf", () => {
  it("lists the recipe sitemaps of the index, and no post or page sitemap", () => {
    const sitemaps = recipeSitemapsOf(fixture("bbc-sitemap.xml"));

    expect(sitemaps).toContain("https://www.bbcgoodfood.com/sitemaps/2026-Q3-recipe.xml");
    expect(sitemaps.length).toBeGreaterThan(50);
    expect(sitemaps.every((url) => url.endsWith("-recipe.xml"))).toBe(true);
  });
});

describe("recipeUrlsOf", () => {
  it("lists free recipe pages and leaves premium ones out", () => {
    const urls = recipeUrlsOf(fixture("bbc-sitemap-recipe.xml"));

    expect(urls).toContain("https://www.bbcgoodfood.com/recipes/basbousa");
    expect(urls.some((url) => url.includes("/premium/"))).toBe(false);
    expect(urls.every((url) => /^https:\/\/www\.bbcgoodfood\.com\/recipes\/[^/]+$/.test(url))).toBe(true);
  });
});

describe("candidatesFor", () => {
  const URLS = [
    "https://www.bbcgoodfood.com/recipes/bibimbap-with-crispy-tofu",
    "https://www.bbcgoodfood.com/recipes/vegan-shepherds-pie",
    "https://www.bbcgoodfood.com/recipes/bibimbap",
    "https://www.bbcgoodfood.com/recipes/shepherds-pie",
    "https://www.bbcgoodfood.com/recipes/bulgogi",
  ];

  it("keeps the slugs naming the dish, the shortest first", () => {
    expect(candidatesFor(URLS, "bibimbap", 5)).toEqual([
      "https://www.bbcgoodfood.com/recipes/bibimbap",
      "https://www.bbcgoodfood.com/recipes/bibimbap-with-crispy-tofu",
    ]);
  });

  it("matches a possessive dish against its slug", () => {
    expect(candidatesFor(URLS, "shepherd's pie", 5)).toEqual([
      "https://www.bbcgoodfood.com/recipes/shepherds-pie",
      "https://www.bbcgoodfood.com/recipes/vegan-shepherds-pie",
    ]);
  });

  it("finds only the vegan version when asked for one", () => {
    expect(candidatesFor(URLS, "vegan shepherd's pie", 5)).toEqual([
      "https://www.bbcgoodfood.com/recipes/vegan-shepherds-pie",
    ]);
  });

  it("stops at the limit, since each candidate is a request", () => {
    expect(candidatesFor(URLS, "bibimbap", 1)).toHaveLength(1);
  });
});

describe("parseRecipePage", () => {
  it("reads the recipe's own rating, not a related recipe's", () => {
    expect(page("bibimbap")).toEqual({
      url: "https://www.bbcgoodfood.com/recipes/bibimbap",
      title: "Bibimbap",
      rating: 4.25,
      reviews: 8,
      diet: "vegetarian",
    });
  });

  it("reads vegan when the page lists both vegan and vegetarian", () => {
    expect(page("vegan-shepherds-pie")).toMatchObject({ rating: 4.1, reviews: 142, diet: "vegan" });
  });

  it("reads an unrated recipe as 0 over 0, which the bar rejects", () => {
    expect(page("basbousa")).toMatchObject({ rating: 0, reviews: 0 });
  });

  it("throws on a page with no recipe state, rather than recording a false rejection", () => {
    expect(() => parseRecipePage("<html><body></body></html>", "https://www.bbcgoodfood.com/recipes/x")).toThrow(
      /markup has probably changed/,
    );
  });
});

describe("classifyPages", () => {
  const rated = (overrides: Partial<RecipePage>): RecipePage => ({
    url: "https://www.bbcgoodfood.com/recipes/x",
    title: "Bibimbap",
    rating: 4.5,
    reviews: 10,
    ...overrides,
  });

  it("accepts the most rated page clearing the BBC bar, which is lower than Marmiton's", () => {
    const pages = [page("bibimbap"), rated({ url: "https://www.bbcgoodfood.com/recipes/b2", reviews: 4 })];

    expect(classifyPages(pages, "bibimbap").map((found) => found.verdict)).toEqual(["accepted", "rejected"]);
  });

  it("is inclusive on both thresholds", () => {
    const edge = rated({ rating: BBC_BAR.minRating, reviews: BBC_BAR.minReviews });

    expect(classifyPages([edge], "bibimbap")[0]!.verdict).toBe("accepted");
  });

  it("rejects vegan shepherd's pie, whose 4.1 is under the bar despite 142 ratings", () => {
    expect(classifyPages([page("vegan-shepherds-pie")], "vegan shepherd's pie")[0]!.verdict).toBe("rejected");
  });
});

/**
 * Found on the first real run: the agent named pisto manchego "pisto" in English, and one typo away
 * is BBC Good Food's `wild-pesto`, at 4.45 over 62. It cleared the bar and was accepted.
 */
describe("exact matching on BBC Good Food", () => {
  const PESTO = "https://www.bbcgoodfood.com/recipes/wild-pesto";

  it("never takes a slug one letter away from the dish for the dish", () => {
    expect(candidatesFor([PESTO], "pisto", 5)).toEqual([]);
  });

  it("never accepts a page whose title is one letter away from the dish", () => {
    const pesto: RecipePage = { url: PESTO, title: "Wild garlic pesto", rating: 4.45, reviews: 62 };

    expect(classifyPages([pesto], "pisto")[0]!.verdict).toBe("skipped");
  });
});
