/**
 * How many a dish can be cooked for, wherever the number is typed or checked.
 *
 * In `shared/` because three places hold the same rule and cannot see each other: the planning
 * writes refuse a plate outside it, the planning screens clamp their sliders to it, and the recipe
 * stepper — which feeds the cook step — has to stop where the server would refuse. Two copies of
 * `8` agreed only until one of them was widened on the side that happened to be in front of
 * somebody.
 */

/** A recipe for nobody is not a recipe; the minus stops here rather than wrapping to zero. */
export const MIN_SERVINGS = 1;

/**
 * The most a single plate is cooked for: a plate is a meal, not a batch for a freezer.
 *
 * Separate from the household size the week step asks: a plate can be cooked for more than the
 * table when the point is leftovers, which is the whole reason portions are editable per meal.
 */
export const MAX_SERVINGS = 8;

/**
 * A whole number of places at the table, from `MIN_SERVINGS` through `MAX_SERVINGS`.
 *
 * The predicate a plate's `servings` and a plan's `people` both have to answer — and refusing
 * non-integers is also what refuses `NaN`, which fails every comparison and would otherwise scale
 * every line of a recipe into `NaN`.
 */
export const isServings = (servings: number) =>
  Number.isInteger(servings) && servings >= MIN_SERVINGS && servings <= MAX_SERVINGS;

/** The nearest number of servings the rule accepts, for a slider or a stepper that must not refuse. */
export const clampServings = (servings: number) =>
  Math.min(Math.max(Math.round(servings), MIN_SERVINGS), MAX_SERVINGS);

/**
 * A quantity written for `written` people, for `wanted` instead.
 *
 * Linear, and deliberately naive: a recipe for two does not become a recipe for four by doubling
 * the salt, and no cook believes it does. Modelling that would need a per-ingredient scaling curve
 * the catalog does not carry, and the honest version of this is the one a cook can check in their
 * head. The result is exact; rounding to the unit's precision is for whoever draws it
 * (`roundQuantity`), so a halved recipe does not read `0.5000000001`.
 *
 * In `shared/` because two places must agree on the number: the recipe screens scale their lines
 * (`scaleTo`), and Cuisko's brief quotes them to a cook asking from the stove (`recipeBrief`).
 *
 * A recipe that serves nobody has no ratio to scale by, and dividing would produce infinities, so
 * its quantity comes back untouched — as it does for the servings it was written for.
 */
export const scaleQuantity = (quantity: number, written: number, wanted: number) =>
  written <= 0 || wanted === written ? quantity : quantity * (wanted / written);
