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
