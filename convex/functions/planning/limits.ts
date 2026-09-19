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

/**
 * How many a plate is cooked for — `shared/servings.ts`'s rule, re-exported so the planning writes
 * keep reading their ceilings from one file. It moved when the recipe stepper, which feeds the cook
 * step, had to stop where the server refuses, and `src/` cannot reach this folder.
 */
export { isServings, MAX_SERVINGS } from "@shared/servings";

/** A repeated date, slot or plate is refused rather than deduplicated — see `planDraft`. */
export const isDistinct = <T>(values: T[]) => new Set(values).size === values.length;
