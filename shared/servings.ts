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
