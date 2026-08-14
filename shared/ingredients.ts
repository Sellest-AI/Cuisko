/**
 * The unit vocabulary, and how to write one down.
 *
 * Shared rather than owned by a module because two of them need it and neither may reach into the
 * other's private `_model/` (lint R8): groceries formats what the cellar holds, planning formats
 * what a week's meals add up to, and a second copy of the labels is how the two drift apart.
 */

export const UNITS = ["pcs", "kg", "g", "mg", "cl", "ml", "l", "cs", "cc", "oz", "lb"] as const;

export type Unit = (typeof UNITS)[number];

export const isUnit = (value: string | undefined): value is Unit =>
  value !== undefined && (UNITS as readonly string[]).includes(value);

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
