/**
 * The ceilings a planning request is held to, wherever it arrives.
 *
 * Here rather than beside either caller because two entry points enforce them — `planDraft` sizes a
 * week from them and `commitPlan` refuses one that exceeds them — and the tunnel that asks is not
 * the thing that guarantees them. A second copy agrees with this one only until somebody widens it
 * on the side that happens to be in front of them.
 */

/** A week. Past that the plan is guessing at a shop that has not happened yet. */
export const MAX_DAYS = 7;

/**
 * The widest window a range read collects, in days.
 *
 * Wider than a plan because two readers ask: home's strip wants today ±3, and the recipe screen's
 * "when do you want to cook this?" grid offers today and the eight days after it. Still a bounded
 * `.collect()` — the ceiling is what makes it one.
 */
export const MAX_RANGE_DAYS = 9;

/** The most one plate is cooked for: a plate is a meal, not a batch for a freezer. */
export const MAX_SERVINGS = 8;

/** A repeated date, slot or plate is refused rather than deduplicated — see `planDraft`. */
export const isDistinct = <T>(values: T[]) => new Set(values).size === values.length;

/**
 * A whole number of places at the table, from one through `MAX_SERVINGS`.
 *
 * The predicate a plate's `servings` and a plan's `people` both have to answer — and refusing
 * non-integers is also what refuses `NaN`, which fails every comparison and would otherwise scale
 * every line of a recipe into `NaN`.
 */
export const isServings = (servings: number) =>
  Number.isInteger(servings) && servings >= 1 && servings <= MAX_SERVINGS;
