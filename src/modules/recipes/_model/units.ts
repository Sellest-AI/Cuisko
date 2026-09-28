/**
 * The other units a recipe line can be read in — the chicken the recipe weighs in grams, counted in
 * pieces — for the tile a cook taps to switch between them.
 *
 * Display only. Nothing here is stored or sent back: the recipe keeps the unit it was written in,
 * and a tap is forgotten with the screen.
 */

import {
  convertQuantity,
  isUnit,
  stockUnitOf,
  toGrams,
  weighableUnits,
  type GramWeights,
  type RecipeUnit,
  type StockUnit,
  type Unit,
} from "@shared/ingredients";

/** What the catalog row knows about converting this ingredient, as `loadRecipe` ships it. */
export type Conversion = GramWeights & { defaultUnit: Unit };

/** The order the kinds are offered in after the line's own. */
const KINDS: readonly StockUnit[] = ["pcs", "g", "ml"];

/**
 * The units a tap cycles through, the line's own unit first.
 *
 * One per kind of measure the ingredient can be weighed in, not every unit `weighableUnits` answers
 * for: a chicken cycles grams and pieces, never grams, kilos, milligrams, ounces and pounds. Within a
 * kind, the line's own unit stands for it, then the ingredient's `defaultUnit` — milk bought in cl
 * reads in cl — then the unit stock is counted in.
 *
 * A line in slices stays in slices, and slices are offered to no other line: a slice is a cut of a
 * whole whose size the recipe chose, not a measure of the ingredient. A line in a unit the
 * ingredient cannot weigh has nothing to convert from, and stays as written too.
 */
export const displayUnits = (unit: RecipeUnit, conversion: Conversion): RecipeUnit[] => {
  if (!isUnit(unit)) return [unit];

  const weighable = weighableUnits(conversion);
  if (!weighable.includes(unit)) return [unit];

  const own = stockUnitOf(unit);
  const kinds = new Set(weighable.filter(isUnit).map(stockUnitOf));
  const others = KINDS.filter((kind) => kind !== own && kinds.has(kind)).map((kind) =>
    stockUnitOf(conversion.defaultUnit) === kind ? conversion.defaultUnit : kind,
  );

  return [unit, ...others];
};

/**
 * A quantity rewritten in another unit, or `undefined` when either end cannot be weighed.
 *
 * Within a kind it is plain ratio and needs nothing from the ingredient; across kinds it goes
 * through grams, the only measure every weight on the catalog row is written against.
 */
export const convertLine = (
  quantity: number,
  from: RecipeUnit,
  to: RecipeUnit,
  conversion: Conversion,
): number | undefined => {
  if (from === to) return quantity;

  if (isUnit(from) && isUnit(to)) {
    const sameKind = convertQuantity(quantity, from, to);
    if (sameKind !== undefined) return sameKind;
  }

  const grams = toGrams(quantity, from, conversion);
  const gramsPerUnit = toGrams(1, to, conversion);
  if (grams === undefined || !gramsPerUnit) return undefined;

  return grams / gramsPerUnit;
};
