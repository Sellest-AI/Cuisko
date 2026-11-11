import type { Doc } from "@convex/_generated/dataModel";
import {
  isRatioField,
  NUTRIENT_FIELDS,
  RATIO_FIELDS,
  type RatioField,
  type RepairableField,
} from "@convex/schema/ingredientPayloads";
import { toGrams, type RecipeUnit } from "@shared/ingredients";

/** The four nutrients the Nutri-Score reads that a row may lack. `iron` is not one of them. */
const _SCORE_NUTRIENTS = NUTRIENT_FIELDS.filter((field) => field !== "iron");

/**
 * The ratio a unit needs to be weighed, or nothing when grams need no ratio at all.
 *
 * Asked of `toGrams` itself, one ratio at a time, rather than restated as a unit → field table:
 * the save and the conversion can then never disagree about which unit needs which weight.
 */
const _ratioFor = (unit: RecipeUnit): RatioField | undefined => {
  if (toGrams(1, unit, {}) !== undefined) return undefined;

  return RATIO_FIELDS.find((field) => toGrams(1, unit, { [field]: 1 }) !== undefined);
};

/** A repairable field's current value: a weight on the row, a nutrient in its `nutrition`. */
export const fieldValue = (row: Doc<"ingredients">, field: RepairableField): number | undefined =>
  isRatioField(field) ? row[field] : row.nutrition[field];

const _isUnset = (row: Doc<"ingredients">, field: RepairableField) => fieldValue(row, field) === undefined;

/**
 * What a row lacks for these recipe units to give a recipe its nutrition and its Cui-Score.
 *
 * The ratio each unit needs that the row cannot answer, once each — "10 cl" and "1 l" of chicken
 * both ask for `gramsPerMl` — then the four Nutri-Score nutrients the row lacks.
 *
 * `iron` is added only when the list is otherwise non-empty: it gates no grade, so it never starts
 * a repair, but a repair already paying for a call may as well fill it.
 */
export const missingFields = (row: Doc<"ingredients">, units: RecipeUnit[]): RepairableField[] => {
  const ratios = new Set(units.map(_ratioFor).filter((field) => field !== undefined));
  const missing: RepairableField[] = [
    ...RATIO_FIELDS.filter((field) => ratios.has(field) && _isUnset(row, field)),
    ..._SCORE_NUTRIENTS.filter((field) => _isUnset(row, field)),
  ];

  return missing.length && _isUnset(row, "iron") ? [...missing, "iron"] : missing;
};

/**
 * The fields of `fields` still undefined on the row — what a repair job checks again before it
 * pays for a call, since another job may have filled them since the save scheduled it.
 */
export const stillMissing = (row: Doc<"ingredients">, fields: RepairableField[]): RepairableField[] =>
  fields.filter((field) => _isUnset(row, field));
