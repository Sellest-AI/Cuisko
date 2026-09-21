/**
 * BBC Good Food, the second source: for dishes Marmiton has no reviewed recipe of, and for real
 * vegan versions of a dish, which Marmiton almost never has.
 *
 * Found through the sitemap, never the site's search: robots.txt disallows `/search*` for every
 * user agent, and allows the sitemap and the recipe pages. So a dish is matched against recipe
 * slugs offline, and only the few candidates are fetched.
 *
 * Offline by design, like `marmiton.ts`: this file takes XML and HTML and returns data. The fetch,
 * the throttle and the cache belong to the script.
 */
import { load } from "cheerio";
import * as z from "zod/v4";

import type { VegetarianDiet } from "@shared/diets";
import { canonicalUrlOf } from "@shared/urls";

import { matchesDish, type MatchOptions } from "./dishMatch";
import { type Bar, classify, type RatedRecipe, type Verdict } from "./verdicts";

/**
 * Lower than Marmiton's, because BBC Good Food's ratings are fewer and harsher: its best-known
 * bibimbap is 4.25 over 8. The import filter only, like `MARMITON_BAR`: no surface shows a score.
 */
export const BBC_BAR = { minReviews: 5, minRating: 4.2 } as const satisfies Bar;

/** Titles and slugs here are edited, so a word one letter away is another word, not a typo. */
const BBC_MATCHING: MatchOptions = { typos: false };

/** A recipe page's path. The sitemaps also list `/premium/` recipes, which are behind a paywall. */
const RECIPE_PATH = /^\/recipes\/[^/]+$/;

const _locsOf = (xml: string): string[] => {
  const $ = load(xml, { xml: true });

  return $("loc")
    .map((_, loc) => $(loc).text().trim())
    .get();
};

/** The recipe sitemaps listed in the sitemap index, one per quarter (`2026-Q3-recipe.xml`). */
export const recipeSitemapsOf = (indexXml: string): string[] =>
  _locsOf(indexXml).filter((loc) => /-recipe\.xml$/.test(loc));

/** The free recipe pages of one recipe sitemap, canonical. Premium recipes are left out. */
export const recipeUrlsOf = (sitemapXml: string): string[] =>
  _locsOf(sitemapXml).flatMap((loc) => {
    const url = canonicalUrlOf(loc);

    return url && RECIPE_PATH.test(new URL(url).pathname) ? [url] : [];
  });

const _slugOf = (url: string): string => new URL(url).pathname.split("/").pop() ?? "";

/**
 * The recipe pages worth fetching for `dish` (in English): those whose slug names it, the shortest
 * slugs first, at most `limit`.
 *
 * Capped because a generic dish names hundreds of slugs ("chicken curry"), and each fetch is a
 * second. The shortest slug is the closest to the bare dish: "bibimbap" before
 * "bibimbap-with-crispy-tofu-and-kimchi".
 */
export const candidatesFor = (urls: readonly string[], dish: string, limit: number): string[] =>
  urls
    .filter((url) => matchesDish(_slugOf(url), dish, BBC_MATCHING))
    .sort((a, b) => _slugOf(a).length - _slugOf(b).length)
    .slice(0, limit);

/** The part of the page state the parser reads. Validated: a change of shape must not read as 0. */
const _postContentSchema = z.object({
  title: z.string(),
  canonicalUrl: z.string().optional(),
  userRatings: z.object({ avg: z.number().optional(), total: z.number().int().nonnegative() }),
  schema: z.object({ suitableForDiet: z.string().optional() }),
});

export type RecipePage = RatedRecipe & { diet?: VegetarianDiet };

/** "https://schema.org/VeganDiet, https://schema.org/VegetarianDiet" → "vegan". */
const _dietOf = (suitableForDiet = ""): VegetarianDiet | undefined =>
  /VeganDiet/.test(suitableForDiet) ? "vegan" : /VegetarianDiet/.test(suitableForDiet) ? "vegetarian" : undefined;

/**
 * The recipe on a page: its title, its rating and its diet.
 *
 * Read from the page's own state (`#__POST_CONTENT__`), because the schema.org block carries no
 * `aggregateRating`, and the page's other `rating` objects belong to the related recipes shown
 * under it. `userRatings` is the one about this recipe. An unrated recipe has no `avg` and reads
 * as 0 over 0, which the bar rejects.
 *
 * Throws when the state is missing or has another shape: the markup changed, and reading it as
 * unrated would record every page of the run as rejected.
 */
export const parseRecipePage = (html: string, url: string): RecipePage => {
  const $ = load(html);
  const text = $("#__POST_CONTENT__").text();
  const parsed = text ? _postContentSchema.safeParse(JSON.parse(text)) : undefined;
  if (!parsed?.success) {
    throw new Error(`BBC Good Food page ${url} has no recipe state this parser can read. The markup has probably changed.`);
  }

  const { title, canonicalUrl, userRatings, schema } = parsed.data;
  const diet = _dietOf(schema.suitableForDiet);

  return {
    url: canonicalUrlOf(canonicalUrl ?? url) ?? url,
    title: title.normalize("NFC"),
    rating: userRatings.avg ?? 0,
    reviews: userRatings.total,
    ...(diet && { diet }),
  };
};

/** Every page of one dish's lookup with its verdict (`classify`, at `BBC_BAR`). */
export const classifyPages = (pages: readonly RecipePage[], dish: string): (RecipePage & { verdict: Verdict })[] =>
  classify(pages, dish, BBC_BAR, BBC_MATCHING);
