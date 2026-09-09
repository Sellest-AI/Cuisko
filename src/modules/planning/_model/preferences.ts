/**
 * The `seeks` half of a person's preferences: what one tap on one chip does to the list.
 *
 * Framework-free — no React, no Jotai, no Convex (see `src/modules/AGENTS.md`) — and in `_model/`
 * rather than inside the screen for one reason: **this is the only enforcement of the mutually
 * exclusive pair anywhere in the system.** `EXCLUSIVE_PREFERENCES` says so, and the validator
 * accepts the pair on purpose, because refusing it there would turn a stale client into a write
 * that fails rather than a screen that corrects itself. A rule with exactly one enforcement point
 * and no test is a rule that ships broken the first time somebody refactors the tap handler.
 */

import {
  EXCLUSIVE_PREFERENCES,
  NUTRITION_PREFERENCES,
  type NutritionPreference,
} from "@shared/preferences";

const _isExclusive = (preference: NutritionPreference) =>
  (EXCLUSIVE_PREFERENCES as readonly NutritionPreference[]).includes(preference);

/**
 * `seeks` after `toggled` is tapped. Returns the next list; never mutates.
 *
 * Switching one of the pair on switches the other off, because wanting a light meal and a
 * substantial one is not a filter, it is a contradiction — and the two tags are exclusive on the
 * recipe as well (500 kcal against 850), so a row holding both would match nothing at all.
 *
 * Switching one **off** is always just that. Nothing is ever turned on by turning something off,
 * so the pair can be left empty: not wanting either is an ordinary answer.
 */
export const resolveSeeks = (
  seeks: readonly NutritionPreference[],
  toggled: NutritionPreference,
): NutritionPreference[] => {
  if (seeks.includes(toggled)) return seeks.filter((seek) => seek !== toggled);

  const kept = _isExclusive(toggled) ? seeks.filter((seek) => !_isExclusive(seek)) : seeks;

  /** Rebuilt in the vocabulary's own order, the order `save` normalises to on the way in anyway. */
  return NUTRITION_PREFERENCES.filter(
    (preference) => preference === toggled || kept.includes(preference),
  );
};
