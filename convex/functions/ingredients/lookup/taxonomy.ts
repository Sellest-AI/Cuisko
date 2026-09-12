import { foldCost, gradesIn, searchTerms } from "@shared/ingredientMatch";
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
 * **Among the spellings that fold to one key, the one that had to throw away the fewest words owns
 * it.** Folding is lossy by design — `searchTerms` strips quantities, articles and every
 * preparation word — so `oignon en poudre`, `Dés de jambon`, `feuille de citronnier` and
 * `pomme de terre en poudre` all fold onto a bare food's key. Claimed by the upstream file's order,
 * which is no order at all, `oignon` resolved to onion POWDER, `jambon` to diced ham and `citron`
 * to lemon LEAF. Each then answered a resolve with another food's names and another food's CIQUAL
 * figures, and a row invented from it was wrong in eight numbers at once with nothing to say so.
 *
 * ⚠️ The rule counts words rather than asking whether folding dropped any, and the difference is
 *    load-bearing: `pomme de terre` drops `de` itself, so a yes-or-no predicate disqualifies the
 *    potato from its own name. It wins on dropping one word where the flour drops three. An earlier
 *    version asked only whether a QUALIFIER came off, which is why `Dés de jambon` — reduced by two
 *    stopwords and no qualifier — still held `jambon`.
 *
 * **A graded spelling claims nothing here, at any rank.** `crème à 33% de matière grasse` is not
 * the entry to hand somebody who asked about cream in general, and `searchTerms` strips the grade
 * from the key, so eight cream entries fold onto `creme matiere grasse` and whichever won was the
 * wrong fat content for the other seven. Where excluding them empties a key the lookup misses and
 * the resolver falls through to the steps that can build a correct row: a miss costs one
 * generation, a wrong fat content is permanent and silent.
 *
 * ⚠️ A grade in the shopper's QUERY is the opposite situation and is left alone — `steak haché 5%`
 *    finding the grade-free `steak haché` is the designed path, and `gradesIn` re-attaches the 5%
 *    when the catalog is re-searched. Only a grade in the ENTRY's own name is a defect.
 *
 * Equal cost keeps the earlier entry, which is the tie nothing else can break: two foods whose own
 * names fold together are a genuine ambiguity, and the file's order is as good an answer as any.
 */
let index: Map<string, TaxonomyEntry> | undefined;

const spellingIndex = (): Map<string, TaxonomyEntry> => {
  if (index) return index;

  const built = new Map<string, TaxonomyEntry>();
  const ranked = new Map<string, number>();

  const claim = (entry: TaxonomyEntry, spelling: string) => {
    const key = searchTerms(spelling);
    if (!key || gradesIn(spelling).length) return;

    const cost = foldCost(spelling);
    if (!built.has(key) || cost < ranked.get(key)!) {
      built.set(key, entry);
      ranked.set(key, cost);
    }
  };

  for (const entry of TAXONOMY) for (const spelling of spellingsOf(entry)) claim(entry, spelling);

  index = built;

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
