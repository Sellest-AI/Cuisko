import type { IngredientNutrition } from "@shared/nutrition";

import type { TaxonomyEntry } from "./taxonomy";

import { COMPOSITION } from "./data/composition";

/**
 * The nutrition CIQUAL holds for a taxonomy entry, if it holds any.
 *
 * Takes the entry rather than a code so the join stays in one place: the code lives on the
 * taxonomy row and nowhere else, and a caller passing a bare string would be a caller that had to
 * know that. Roughly one food in seven has one — the taxonomy is a naming corpus first.
 *
 * Every food in the generated table carries all eight fields. One CIQUAL left unmeasured on any
 * of them was dropped by the build script rather than written with a zero — see the note on
 * `cellValue` there for why that distinction is load-bearing.
 *
 * No network, no key, no rate limit, no outage. That is why it runs before anything in this folder
 * that has all four.
 */
export const compositionOf = (entry: TaxonomyEntry): IngredientNutrition | undefined =>
  entry.ciqualCode ? COMPOSITION[entry.ciqualCode] : undefined;
