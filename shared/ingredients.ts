/**
 * The unit vocabulary, and how to write one down.
 *
 * Shared rather than owned by a module because two of them need it and neither may reach into the
 * other's private `_model/` (lint R8): groceries formats what the cellar holds, planning formats
 * what a week's meals add up to, and a second copy of the labels is how the two drift apart.
 */

export const UNITS = ["pcs", "kg", "g", "mg", "cl", "ml", "l", "cs", "cc", "oz", "lb"] as const;

export type Unit = (typeof UNITS)[number];

/**
 * Case-insensitive on purpose: "500 KG" is a shopper writing in a hurry, not a different unit.
 * The navigation bar parses free text and the quantity sheet validates it — they have to agree,
 * or a quantity that parses in one is rejected by the other.
 */
export const isUnit = (value: string | undefined): value is Unit =>
  value !== undefined && UNITS.some((unit) => unit === value.toLowerCase());

/**
 * Drawn when a catalog row predates the `emoji` column. The seed always writes one, falling back
 * to the category's, so this is the placeholder for rows older than that field — not a normal
 * state. Shared because the grid and the search bar draw the same ingredient and must not
 * disagree about what a missing glyph looks like.
 */
export const NO_EMOJI = "\u{1F37D}\u{FE0F}";

const UNIT_LABELS: Record<Unit, string> = {
  g: "g",
  mg: "mg",
  kg: "kg",
  lb: "lb",
  oz: "oz",
  cl: "cl",
  ml: "ml",
  l: "L",
  pcs: "pcs",
  cs: "cs",
  cc: "cc",
};

export const unitLabel = (unit: Unit) => UNIT_LABELS[unit];

/**
 * Placeholder formatting. Real copy normalises per ingredient — "4 yaourts", not "500 g of
 * yoghurt" — which needs the ingredient to carry its own preferred unit, and that is not
 * modelled yet. A fractional amount keeps one decimal so a halved recipe does not read `0.5000000001`.
 */
export const formatQuantity = (amount: number, unit: Unit) =>
  `${Number.isInteger(amount) ? amount : amount.toFixed(1)} ${unitLabel(unit)}`;

/**
 * What a catalog ingredient knows about its own weight — the two optional fields on the
 * `ingredients` table, passed structurally so this file never has to reach for a `Doc`.
 */
export type GramWeights = {
  /** Grams in one of them: 150 for an onion. */
  gramsPerPiece?: number;
  /** Density, in grams per millilitre: 0.91 for oil, 1.42 for honey. */
  gramsPerMl?: number;
};

/** Grams in one of each mass unit. The only conversions that need nothing from the ingredient. */
const GRAMS_PER_MASS_UNIT = {
  g: 1,
  mg: 0.001,
  kg: 1000,
  oz: 28.349523125,
  lb: 453.59237,
} as const satisfies Partial<Record<Unit, number>>;

/**
 * Millilitres in one of each volume unit.
 *
 * `cs` and `cc` are the French cuillère à soupe and cuillère à café, which are defined as 15 and
 * 5 ml — not as the US tablespoon/teaspoon, which are 14.79 and 4.93. The difference is under a
 * percent of a spoonful and nothing here would notice, but the number has to come from somewhere.
 */
const ML_PER_VOLUME_UNIT = {
  ml: 1,
  cl: 10,
  l: 1000,
  cs: 15,
  cc: 5,
} as const satisfies Partial<Record<Unit, number>>;

/**
 * A quantity in grams, or `undefined` when this ingredient does not know what it weighs.
 *
 * Every nutrition fact in the catalog is per 100g, so this is the gate every recipe line passes
 * through before it can be counted. Returning `undefined` rather than guessing is the point: a
 * caller that substituted 1 g/ml for a missing density would understate honey by 40% and report it
 * with the same confidence as a line measured in grams.
 *
 * Units are matched by table rather than by falling through to `pcs`, so a unit added to `UNITS`
 * and to neither table returns `undefined` instead of being silently weighed as a piece.
 */
export const toGrams = (quantity: number, unit: Unit, weights: GramWeights): number | undefined => {
  if (unit in GRAMS_PER_MASS_UNIT) {
    return quantity * GRAMS_PER_MASS_UNIT[unit as keyof typeof GRAMS_PER_MASS_UNIT];
  }

  if (unit in ML_PER_VOLUME_UNIT) {
    if (weights.gramsPerMl === undefined) return undefined;
    return quantity * ML_PER_VOLUME_UNIT[unit as keyof typeof ML_PER_VOLUME_UNIT] * weights.gramsPerMl;
  }

  if (unit === "pcs") {
    if (weights.gramsPerPiece === undefined) return undefined;
    return quantity * weights.gramsPerPiece;
  }

  return undefined;
};
