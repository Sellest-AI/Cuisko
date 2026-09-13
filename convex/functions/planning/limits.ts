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

/** The most one plate is cooked for: a plate is a meal, not a batch for a freezer. */
export const MAX_SERVINGS = 8;

/** A repeated date, slot or plate is refused rather than deduplicated — see `planDraft`. */
export const isDistinct = <T>(values: T[]) => new Set(values).size === values.length;
