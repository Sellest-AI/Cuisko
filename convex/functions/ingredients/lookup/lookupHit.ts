import { LOCALES, type LocalizedList } from "@convex/schema/i18n";
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
 * measured — and a source that publishes seven of the eight fields has still told us seven true
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
  nutrition?: MeasuredNutrition;
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
 * The eight nutrients, as a list rather than as `Object.keys` of something.
 *
 * Exported because the agent that fills the gaps has to ask for exactly these — a second literal
 * list over in `agent/tools/sanitizeIngredient.ts` would typecheck against this one only for as
 * long as the two happened to agree.
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
] as const satisfies readonly (keyof IngredientNutrition)[];

/** What a source actually measured — any subset of the eight, and never a fabricated zero. */
export type MeasuredNutrition = Partial<IngredientNutrition>;

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
 * Written against the field list rather than `Object.values` so that adding a ninth nutrient to
 * `IngredientNutrition` fails to compile here instead of being silently unchecked.
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

/** How many of the eight a source put a number on — how a lookup picks between its own results. */
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
 * ⚠️ **The row still records ONE `source`, and a merged row's numbers no longer all come from it.**
 * Seven measured fields beside one modelled one is a better row than the seven-field row this used
 * to discard, but `source: "foodComposition"` now means "mostly, and the gaps were filled" rather
 * than "a laboratory measured every number here". A screen that caveats a Nutri-Score by `source`
 * is reading a claim that is one field weaker than it looks.
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
