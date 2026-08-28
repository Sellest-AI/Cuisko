import { searchTerms } from "@shared/ingredientMatch";
import { LOCALES, type Locale, type LocalizedList } from "@convex/schema/i18n";

import { TAXONOMY } from "./data/taxonomy";

/**
 * One food in the Open Food Facts ingredients taxonomy, pruned to the locales this app has.
 *
 * `key` is OFF's canonical identifier (`en:carrot`) and is not shown to anyone — it is here so a
 * hit can be traced back to the upstream row, and so two lookups that land on the same food can be
 * recognised as the same food.
 */
export type TaxonomyEntry = {
  key: string;
  names: Partial<Record<Locale, string>>;
  synonyms: Partial<Record<Locale, string[]>>;
  /** Joins to `composition.ts`. Absent for the ~85% of foods CIQUAL does not cover. */
  ciqualCode?: string;
};

/**
 * Every spelling of every food, folded to the form `searchTerms` produces, pointing at its entry.
 *
 * Built once per isolate and not per call. Convex reuses an isolate across invocations, so the
 * ~6k entries are walked on the first resolve a deployment serves and never again; building it
 * inside the lookup would pay that cost on every keystroke that reaches step 2.
 *
 * A spelling shared by two foods keeps the FIRST entry that claimed it. The taxonomy is ordered
 * parents before children, so the first claimant is the more general food — "poivron" resolving to
 * bell pepper rather than to one cultivar of it is the answer a shopper meant.
 */
let index: Map<string, TaxonomyEntry> | undefined;

const spellingIndex = (): Map<string, TaxonomyEntry> => {
  if (index) return index;

  index = new Map();
  for (const entry of TAXONOMY) {
    const spellings = [...Object.values(entry.names), ...Object.values(entry.synonyms).flat()];

    for (const spelling of spellings) {
      const key = searchTerms(spelling);
      if (key && !index.has(key)) index.set(key, entry);
    }
  }

  return index;
};

/**
 * What a shopper typed, looked up in the taxonomy — a dictionary read, not a search.
 *
 * **Exact on the folded form, deliberately.** Fuzzy matching already happened one step earlier
 * against the catalog, which is the corpus where a near-miss is worth surfacing because a human
 * curated it. Here the corpus is six thousand foods including every additive and flavouring OFF
 * knows, and a fuzzy hit in it is a confident-looking wrong answer with a nutrition table attached.
 * The folding is not nothing: `searchTerms` strips accents, quantities, articles and preparation
 * qualifiers, so "2 Carottes râpées" and "carotte" reach the same key.
 *
 * Locale-blind on purpose. Which language the shopper typed is the question, not an input: the
 * whole point of this step is that "carrot" typed on a French device is a French shopper's English
 * word, and asking the French half of the taxonomy would reproduce the miss that got us here.
 */
export const findInTaxonomy = (text: string): TaxonomyEntry | undefined => {
  const key = searchTerms(text);
  if (!key) return undefined;

  return spellingIndex().get(key);
};

/**
 * An entry's name and synonyms, kept in the language the taxonomy filed them under.
 *
 * This is the information `spellingsOf` throws away, and it is the half a row needs: 2216 of the
 * 6248 entries know a food in one language only, so which language a spelling is in decides
 * whether it can be stored as a name at all.
 */
export const namesOf = (entry: TaxonomyEntry): LocalizedList => {
  const names: LocalizedList = {};

  for (const locale of LOCALES) {
    const spellings = [entry.names[locale], ...(entry.synonyms[locale] ?? [])].filter(
      (spelling): spelling is string => Boolean(spelling),
    );
    if (spellings.length) names[locale] = spellings;
  }

  return names;
};

/** Every name and synonym a taxonomy entry knows, in every locale — what to re-search the catalog with. */
export const spellingsOf = (entry: TaxonomyEntry): string[] => [
  ...Object.values(entry.names),
  ...Object.values(entry.synonyms).flat(),
];
