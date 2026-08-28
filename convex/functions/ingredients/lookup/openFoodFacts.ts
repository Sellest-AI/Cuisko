import type { LocalizedList } from "@convex/schema/i18n";
import {
  measuredCount,
  measuredNutrition,
  type LookupHit,
  type MeasuredNutrition,
} from "./lookupHit";

/**
 * How long a shopper waits on this before we give up on it.
 *
 * Short, and short on purpose: this runs while a placeholder card sits on the grocery list waiting
 * to become real, and Open Food Facts is a volunteer-run service that is sometimes slow and
 * sometimes down — the probe that wrote this file caught it returning 503. The resolver runs this
 * beside USDA rather than after it, so the cost of the timeout is paid once for both.
 */
const TIMEOUT_MS = 4_000;

/** Enough to see past a single badly-named product without paying for a page of them. */
const PAGE_SIZE = 5;

/**
 * Asked for by name so a field the API stops returning is a missing key rather than a silent
 * change in payload size. `nutriments` carries every per-100g figure in one object.
 */
const FIELDS = "product_name,product_name_en,product_name_fr,nutriments";

const ENDPOINT = "https://world.openfoodfacts.org/cgi/search.pl";

/**
 * Open Food Facts asks every client to identify itself, and throttles the ones that do not.
 * Ours says what the app is rather than impersonating a browser.
 */
const USER_AGENT = "Cuisko/1.0 (https://github.com/cuisko)";

type Nutriments = Record<string, unknown>;

type Product = {
  product_name?: string;
  product_name_en?: string;
  product_name_fr?: string;
  nutriments?: Nutriments;
};

/**
 * The products' spellings, split by whether Open Food Facts said what language they are in.
 *
 * `product_name_en` and `product_name_fr` are labelled, so they can become a row's name.
 * `product_name` is not: it is whatever the contributor had in hand, often with a brand attached,
 * and storing it as a locale's name would be guessing at the one fact that must not be guessed.
 * It is still worth keeping as a spelling — the catalog re-search is locale-blind.
 *
 * Order within each language follows the order of `products`, because the caller tries the
 * spellings in sequence and the caller passes the nutrition-bearing product first.
 */
const _spellingsOf = (products: Product[]): { names: LocalizedList; untagged: string[] } => {
  const collected: Record<"en" | "fr" | "untagged", string[]> = { en: [], fr: [], untagged: [] };

  const keep = (into: string[], value: string | undefined) => {
    const spelling = value?.trim();
    if (spelling && !into.includes(spelling)) into.push(spelling);
  };

  for (const product of products) {
    keep(collected.en, product.product_name_en);
    keep(collected.fr, product.product_name_fr);
    keep(collected.untagged, product.product_name);
  }

  const names: LocalizedList = {};
  if (collected.en.length) names.en = collected.en;
  if (collected.fr.length) names.fr = collected.fr;

  return { names, untagged: collected.untagged };
};

/** Whether a hit built from these spellings would carry anything at all. */
const _named = ({ names, untagged }: { names: LocalizedList; untagged: string[] }) =>
  Boolean(names.en?.length || names.fr?.length || untagged.length);

const _number = (nutriments: Nutriments, key: string): number | undefined => {
  const value = nutriments[key];

  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

/** Grams to milligrams — see the warning on `_nutrition`. */
const G_TO_MG = 1000;

/**
 * A product's declared per-100g figures, or nothing.
 *
 * ⚠️ **`sodium_100g` is in grams**, unlike every other source and unlike the schema, which stores
 * milligrams. Open Food Facts normalises salt and sodium to grams per 100g; USDA and CIQUAL both
 * publish sodium in milligrams. Getting this wrong understates sodium by a factor of a thousand,
 * and no screen would ever look wrong.
 */
const _nutrition = (nutriments: Nutriments | undefined): MeasuredNutrition | undefined => {
  if (!nutriments) return undefined;

  const sodium = _number(nutriments, "sodium_100g");

  return measuredNutrition({
    calories: _number(nutriments, "energy-kcal_100g"),
    protein: _number(nutriments, "proteins_100g"),
    fat: _number(nutriments, "fat_100g"),
    saturatedFat: _number(nutriments, "saturated-fat_100g"),
    carbohydrates: _number(nutriments, "carbohydrates_100g"),
    sugars: _number(nutriments, "sugars_100g"),
    fiber: _number(nutriments, "fiber_100g"),
    sodium: sodium === undefined ? undefined : sodium * G_TO_MG,
  });
};

/**
 * The Open Food Facts *products* database — packaged and branded goods, declared by whoever sells
 * them.
 *
 * **The weakest of the three sources, and last for that reason.** It knows "Harissa du Cap-Bon"
 * and it does not really know "carotte": a raw ingredient is a product here only when somebody
 * has sold it in a bag. So it is asked only about the long tail the shipped taxonomy and CIQUAL
 * could not answer, which is exactly the shape it is good at — a jar of something with a label on
 * it. Its nutrition is a manufacturer's declaration rather than a measurement, which is why a row
 * built from it records `openFoodFacts` and not `foodComposition`.
 *
 * Returns `undefined` rather than throwing on any failure — network, timeout, malformed payload,
 * no result. The resolver runs it beside another lookup and continues past both; a third-party
 * outage must not turn into a shopper being told their ingredient is unreadable.
 */
export const searchOpenFoodFacts = async (text: string): Promise<LookupHit | undefined> => {
  const url =
    `${ENDPOINT}?search_terms=${encodeURIComponent(text)}` +
    `&search_simple=1&action=process&json=1&page_size=${PAGE_SIZE}&fields=${FIELDS}`;

  let products: Product[];
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return undefined;

    const body: unknown = await response.json();
    products = (body as { products?: Product[] }).products ?? [];
  } catch {
    // A source that is down is a source that did not answer. The resolver has others, and the
    // shopper is not told about somebody else's outage.
    return undefined;
  }

  // The product that declared the MOST of the eight wins, and its own names lead the list — the
  // caller re-searches the catalog in order, so the names the nutrition belongs to have to be the
  // ones it tries first. Most rather than first-complete because a partial table is now kept: a
  // product declaring seven fields is a better answer than one declaring two, and under the old
  // all-or-nothing rule both were discarded alike. Ties keep the earlier product, which is the
  // order Open Food Facts ranked them in.
  const best = products.reduce<{ product: Product; nutrition?: MeasuredNutrition } | undefined>(
    (winner, product) => {
      const nutrition = _nutrition(product.nutriments);
      if (winner && measuredCount(nutrition) <= measuredCount(winner.nutrition)) return winner;

      return { product, nutrition };
    },
    undefined,
  );

  const spellings = _spellingsOf(best ? [best.product, ...products] : products);
  if (!_named(spellings)) return undefined;

  // Which product the figures belong to, stated rather than implied by leading the list — and
  // carrying the language Open Food Facts labelled it with, since a spelling checked against the
  // wrong language passes on coincidence (see `measuredAs`).
  //
  // EVERY title the jar carries, not the first one found. A product labelled in both languages was
  // being judged on its French name alone, so an English label naming the food exactly could not
  // save the figures — `measuredAboutIt` accepts the hit if any of these names the row's food. The
  // bare `product_name` goes in without a locale, which is the honest answer for a field any
  // contributor fills in whatever language they had.
  const _measuredAs = (product: Product) => [
    ...(product.product_name_fr ? [{ name: product.product_name_fr, locale: "fr" as const }] : []),
    ...(product.product_name_en ? [{ name: product.product_name_en, locale: "en" as const }] : []),
    ...(product.product_name ? [{ name: product.product_name }] : []),
  ];

  const measuredAs = best ? _measuredAs(best.product) : [];

  // `searched`: a product search, so a jar's title never becomes another word for the food.
  return {
    source: "openFoodFacts",
    ...spellings,
    searched: true,
    nutrition: best?.nutrition,
    measuredAs,
  };
};
