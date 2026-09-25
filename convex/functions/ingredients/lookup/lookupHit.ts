import { LOCALES, type Locale, type LocalizedList } from "@convex/schema/i18n";
import { RESOLVABLE, scoreCandidate } from "@shared/ingredientMatch";
import type { IngredientSource } from "@shared/ingredients";

import type { IngredientNutrition } from "@shared/nutrition";

/**
 * What every lookup in this folder returns, whatever it read and wherever it read it.
 *
 * **Names, and never a row.** A lookup answers two questions and only two: what else this food is
 * called, and what it is made of. It does not decide the category, the diet, the allergens or the
 * emoji `ingredients` also requires — those are a judgement, and the step that makes it is the
 * agent. Returning a partial row instead would push every caller into deciding which holes are
 * safe to fill, which is how an allergen list ends up empty because nobody looked rather than
 * because somebody checked.
 *
 * `names` is the payload that pays off first, before any row is ever created: the spellings a
 * lookup knows are what the catalog is searched again with, and that alone resolves the shopper
 * who typed "carrot" on a French device into the `carotte` row that was there all along.
 *
 * **Kept per language, because the sources state one and `ingredientRow` requires one.** Every
 * source here knows which language it is answering in — the taxonomy is keyed by locale, CIQUAL
 * is French, USDA is English, Open Food Facts labels its localised fields — and flattening that
 * away would leave the agent inferring a fact it had already been told. `IngredientFacts.names`
 * needs every locale filled, so a hit that cannot say which language a spelling is in cannot
 * contribute a name to a row.
 *
 * `nutrition` is PARTIAL, and optional on top of that. The naming corpora and the composition
 * tables are different corpora — roughly one food in seven the taxonomy can name is one CIQUAL has
 * measured — and a source that publishes eight of the nine fields has still told us eight true
 * things. The agent fills what is left, and what was measured wins over what was modelled
 * (`measuredOver`).
 */
export type LookupHit = {
  /** Which of the four `INGREDIENT_SOURCES` a row built from this would record. */
  source: IngredientSource;
  /** Spellings the source stated a language for, best-known first within each. */
  names: LocalizedList;
  /**
   * Spellings the source gave with NO language attached — Open Food Facts' bare `product_name`,
   * which a contributor filled in whatever language they had in hand.
   *
   * Searchable but never storable. The catalog re-search is locale-blind, so an untagged spelling
   * is a real extra chance the row already exists; writing one into a locale's `name` is guessing
   * at the one thing that must not be guessed, since the wrong language stored is a row the other
   * language's shopper never finds.
   */
  untagged?: string[];
  /**
   * Whether this source found its answer by SEARCHING for the shopper's words, rather than by
   * looking them up in something curated.
   *
   * The two are different kinds of claim and the difference is not about quality. `findInTaxonomy`
   * resolves a term to one entry and CIQUAL joins to it by code, so those names ARE this food's
   * names — somebody filed them under it. USDA and Open Food Facts are handed a string and return
   * whatever ranked highest, which for "crème de marrons" was five rows sharing the word "de" and
   * for "pâte de pistache" was a guava pastry, on `paste` resembling `pastry`.
   *
   * So a searched hit is evidence and never vocabulary: its spellings are spent re-searching the
   * catalog in `_fromApis`, which is where they pay, and none of them is stored as another word
   * for the food. Read by `sanitizeIngredient`, which is the only place that stores anything.
   *
   * ⚠️ Not inferable from `source`: USDA and CIQUAL both report `foodComposition`, so the field
   * that provenances the NUMBERS cannot answer this. Nor from `measuredAs` being absent — a search
   * that returns names and no nutrition leaves it empty while still having been a search.
   */
  searched?: boolean;
  nutrition?: MeasuredNutrition;
  /**
   * The spelling `nutrition` was actually measured on — which is NOT the same claim as `names`.
   *
   * A source is asked for a term and returns a page of results; the figures below belong to ONE of
   * them, and the rest are spellings it thought were related. Until this field existed that binding
   * was carried by list ORDER — both API lookups put the nutrition-bearing name first and said so
   * in a comment — which is unusable by anything that has to check it, and silently wrong the day
   * somebody sorts the list.
   *
   * Empty means the source vouched for the pairing itself rather than guessing it from a search:
   * CIQUAL's figures are joined to a taxonomy entry by code, so there is no other food they could
   * belong to. Absent reads as trusted only for such a source — a `searched` hit that filled in
   * nothing loses its figures instead, because "I measured something" is the claim the gate exists
   * to refuse (`measuredAboutIt`).
   *
   * **A list, because a product can be labelled twice.** Open Food Facts carries
   * `product_name_en` and `product_name_fr` on the same jar, and judging it on one of them alone
   * throws away figures the other would have vouched for. Every title the source published for
   * that one food goes in, and the figures survive if ANY of them names this row's food.
   *
   * **`locale` is carried, not inferred, and leaving it out was a live defect.** A spelling checked
   * against every language passes if it resembles ANY of them, and resemblance across languages is
   * mostly noise: `Alcoholic beverage, creme de menthe, 72 proof` scores 0.117 against the English
   * `chestnut spread` and 0.347 against the French `crème de marrons`, on the shared word "creme"
   * alone. Checked against every locale it survived, and USDA's crème de menthe — 371 kcal, 41.6 g
   * sugars, the alcohol invisible in the macros — became the nutrition of a chestnut spread.
   *
   * Every source here knows: USDA publishes in English and says so in its own header, and Open Food
   * Facts labels `product_name_fr`. A `locale` of `undefined` is for the one spelling that genuinely
   * carries no language — OFF's bare `product_name` — and only that one is checked against them all.
   */
  measuredAs?: { name: string; locale?: Locale }[];
};

/**
 * Every spelling a hit knows, in any language — what to re-search the locale-blind catalog with.
 *
 * Language-tagged names first and in locale order, then the untagged: the caller tries these in
 * sequence and stops at the first that matches a row, so the spellings a source was confident
 * enough to label go first.
 */
export const spellingsOfHit = (hit: LookupHit): string[] => [
  ...LOCALES.flatMap((locale) => hit.names[locale] ?? []),
  ...(hit.untagged ?? []),
];

/**
 * The nine nutrients, as a list rather than as `Object.keys` of something.
 *
 * Exported because the agent that fills the gaps has to ask for exactly these — a second literal
 * list over in `agent/tools/sanitizeIngredient.ts` would typecheck against this one only for as
 * long as the two happened to agree.
 *
 * ⚠️ **A field missing from this list is silently dropped, not caught.** `satisfies` constrains
 * what may be IN the list, never that everything is — so a tenth nutrient added to
 * `IngredientNutrition` and forgotten here would be read by no source and reach no row, with
 * nothing failing to compile. That is not hypothetical: `iron` was added to the type, to CIQUAL
 * and to USDA, and every figure was still being discarded here until the list was updated too.
 */
export const NUTRITION_FIELDS = [
  "calories",
  "protein",
  "fat",
  "saturatedFat",
  "carbohydrates",
  "sugars",
  "fiber",
  "sodium",
  "iron",
] as const satisfies readonly (keyof IngredientNutrition)[];

/** What a source actually measured — any subset of the nine, and never a fabricated zero. */
export type MeasuredNutrition = Partial<IngredientNutrition>;

/**
 * How close a source's spelling has to be to the name we are holding before the two are believed
 * to be the same food.
 *
 * `RESOLVABLE` rather than a number of its own, because it is the question that constant was
 * measured for — "is this other spelling the food I am holding, or a different one?" — and a second
 * threshold answering it is a second answer to drift from the first (ADR 0011).
 *
 * **It exists because a lookup ASSERTS nothing.** `searchFoodDataCentral` asks USDA for the
 * shopper's words and returns its top five, so "crème de marrons" came back as `Dulce de Leche`,
 * `Cheese, port de salut` and `Alcoholic beverage, creme de menthe, 72 proof` — five rows sharing
 * the word "de" and nothing else. A keyword hit is not a synonym and it is not a measurement of
 * the food you asked about; this is where that is decided.
 *
 * Measured on the failure that prompted it — against `chestnut spread`, the five wrong rows top out
 * at 0.117 and USDA's own `Nuts, chestnuts, european, raw` scores 0.412. 0.3 sits in open space.
 */
export const SAME_FOOD = RESOLVABLE;

/**
 * Whether a source's spelling is about the food this name describes.
 *
 * **Both sides must be the same language, and the caller is what knows that.** `names` on a hit is
 * keyed by locale, so a spelling taken from it is checked against that locale's name — comparing
 * across languages is meaningless here (`carotte` against `carrot` scores 0.229) and it is not
 * merely too strict, it is too LAX in the other direction: `Alcoholic beverage, creme de menthe,
 * 72 proof` scores 0.347 against the French `crème de marrons` on the shared word "creme", which
 * is over the bar. Checked against the English name it belongs to, it is 0.117.
 */
export const aboutTheSameFood = (spelling: string, name: string): boolean =>
  scoreCandidate(name, { id: "", name: spelling }) >= SAME_FOOD;

/**
 * The hits with any nutrition that was measured on a DIFFERENT food dropped.
 *
 * The names are left alone: a hit whose figures belong to something else may still have named this
 * food correctly somewhere in its list, and `toSanitizedIngredient` filters spellings one at a time
 * with the same predicate. What must not survive is the pairing — eight numbers wearing a
 * laboratory's authority while describing a jar of something else.
 *
 * The row this exists for stored USDA's Dulce de Leche verbatim — 315 kcal, 6.84 g protein, 4.53 g
 * saturated fat — as the nutrition of a chestnut spread, and `provenanceOf` then stamped it
 * `foodComposition` so nothing downstream could tell. Both readings are fixed by dropping the one
 * field, which is why this returns hits rather than a filtered list: a source that named the food
 * usefully keeps its names even when its figures go.
 *
 * Checked against the language the source stated for it, and against every language only when the
 * source stated none — see `measuredAs`, where checking them all is what let a crème de menthe
 * through on a French name. A product labelled in two languages offers both titles and survives on
 * EITHER: an English label naming the food exactly is not made worthless by an odd French one.
 *
 * **A searched hit that named nothing loses its figures.** Absence used to mean "trusted", which
 * read the wrong way round for the sources this gate exists for: both keyword sources emit no
 * `measuredAs` when their nutrition-bearing result has no usable title, and those eight numbers
 * then passed unchecked and were stamped `foodComposition`. A curated hit still passes on absence,
 * because `findInTaxonomy` and CIQUAL join by identity — there is no separate food to name.
 */
export const measuredAboutIt = (
  hits: readonly LookupHit[],
  names: Record<Locale, string>,
): LookupHit[] =>
  hits.map((hit) => {
    const measuredAs = hit.measuredAs ?? [];

    // Nothing to check. A curated hit is vouched for by the join that produced it; a searched one
    // has told us only that it measured SOMETHING, which is the claim this gate exists to refuse.
    if (!measuredAs.length) return hit.searched ? { ...hit, nutrition: undefined } : hit;

    const namesIt = measuredAs.some(({ name, locale }) =>
      (locale ? [locale] : LOCALES).some((against) => aboutTheSameFood(name, names[against])),
    );

    return namesIt ? hit : { ...hit, nutrition: undefined };
  });

/**
 * The fields a source genuinely published, and only those.
 *
 * **An absent field stays absent.** A source that does not publish `fiber` has not told us fiber
 * is zero; it has told us nothing about fiber, and the Nutri-Score is computed from all eight
 * together, so a fabricated zero moves the grade a shopper reads. That rule has not changed and is
 * the whole reason this function exists rather than a spread.
 *
 * What changed is what happens to the REST. This used to discard a seven-of-eight answer whole and
 * ask the next source, which threw away seven measurements to avoid one gap. Now the partial is
 * kept and the agent fills the hole — with `measuredOver` putting the measurements back on top, so
 * a modelled number can only ever occupy a field nobody measured.
 *
 * Written against `NUTRITION_FIELDS` rather than `Object.keys(facts)` so that a source handing over
 * a key nobody declared cannot smuggle it into a row. Note what that does NOT buy: a nutrient added
 * to `IngredientNutrition` and left out of that list is dropped here in silence — see the warning
 * on it.
 */
export const measuredNutrition = (
  facts: Partial<Record<keyof IngredientNutrition, number>>,
): MeasuredNutrition | undefined => {
  const measured: MeasuredNutrition = {};

  for (const field of NUTRITION_FIELDS) {
    const value = facts[field];
    if (value !== undefined && Number.isFinite(value)) measured[field] = value;
  }

  return Object.keys(measured).length ? measured : undefined;
};

/** How many of the nine a source put a number on — how a lookup picks between its own results. */
export const measuredCount = (nutrition: MeasuredNutrition | undefined): number =>
  nutrition ? NUTRITION_FIELDS.filter((field) => nutrition[field] !== undefined).length : 0;

/**
 * How authoritative a source's numbers are, most first. Laboratory measurement beats a
 * manufacturer's declaration, which beats anything a model produced.
 *
 * `seed` outranks everything because the repo catalog is hand-curated; `agent` is last by
 * construction, and it is the only entry here that never came from a measurement at all.
 */
const AUTHORITY: readonly IngredientSource[] = ["seed", "foodComposition", "openFoodFacts", "agent"];

/**
 * The one `source` a row built from these hits records — the best source that actually measured
 * something, or `agent` when nothing did.
 *
 * Only a hit carrying `nutrition` counts. A lookup that contributed names alone has told us what a
 * food is called, which is worth a great deal and is not a claim about the numbers, so a row whose
 * every figure was modelled must not wear a composition table's provenance because a taxonomy
 * happened to know the word.
 *
 * The caveat `measuredOver` records applies to whatever this returns: the answer means "mostly this
 * source, and the gaps were filled by the model", not "every number here was measured".
 */
export const provenanceOf = (hits: readonly LookupHit[]): IngredientSource =>
  hits
    .filter((hit) => measuredCount(hit.nutrition) > 0)
    .map((hit) => hit.source)
    .sort((left, right) => AUTHORITY.indexOf(left) - AUTHORITY.indexOf(right))[0] ?? "agent";

/**
 * The model's eight numbers with every measured one laid back over the top.
 *
 * **A modelled number survives only where nothing measured that field.** This is what makes an
 * invented figure a last resort rather than a peer: CIQUAL's protein is CIQUAL's protein even when
 * the model offered its own, and the model's fiber is used only because no source published one.
 * Hits are consulted in `AUTHORITY` order, so a laboratory figure beats a label's.
 *
 * @limitation **The row still records ONE `source`, and a merged row's numbers no longer all come
 * from it.** Seven measured fields beside one modelled one is a better row than the seven-field row
 * this used to discard, but `source: "foodComposition"` now means "mostly, and the gaps were
 * filled" rather than "a laboratory measured every number here". A screen that caveats a
 * Nutri-Score by `source` is reading a claim that is one field weaker than it looks.
 */
export const measuredOver = (
  modelled: IngredientNutrition,
  hits: readonly LookupHit[],
): IngredientNutrition => {
  const ranked = [...hits].sort(
    (left, right) => AUTHORITY.indexOf(left.source) - AUTHORITY.indexOf(right.source),
  );

  const merged: IngredientNutrition = { ...modelled };

  // Least authoritative first, so the better source overwrites what the weaker one wrote.
  for (const hit of ranked.reverse()) {
    for (const field of NUTRITION_FIELDS) {
      const value = hit.nutrition?.[field];
      if (value !== undefined) merged[field] = value;
    }
  }

  return merged;
};
