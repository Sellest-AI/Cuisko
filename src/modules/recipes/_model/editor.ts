/**
 * The half of the recipe editor below the ingredients: what the agent guessed on the first save,
 * and what the cook may now correct by hand — utensils, authored tags, timings, difficulty, cuisine.
 *
 * Framework-free, and structural rather than typed off the backend's `RecipeDetail`: `_model/`
 * takes no Convex import (see `src/modules/AGENTS.md`). The vocabularies come from `shared/`,
 * which both sides already agree on.
 */

import type { Cuisine } from "@shared/cuisines";
import type { Equipment } from "@shared/equipments";
import { type DifficultyLevel, MAX_TIMING_MINUTES, type Timings } from "@shared/recipes";
import { AUTHORED_TAGS, type AuthoredTag, type ComputedTag, type Tag } from "@shared/tags";

export type EditorDetails = {
  tags: AuthoredTag[];
  equipments: Equipment[];
  difficulty: DifficultyLevel;
  cuisine: Cuisine;
  timings: Timings;
};

type DetailedRecipe = {
  tags: Tag[];
  equipments: Equipment[];
  difficulty: DifficultyLevel;
  cuisine: Cuisine;
  timings: Timings;
};

const _isAuthored = (tag: Tag): tag is AuthoredTag => (AUTHORED_TAGS as readonly Tag[]).includes(tag);

/**
 * The row's own values, as the form opens on them.
 *
 * Authored tags only. The computed ones fall out of the ingredients on every write, so a form that
 * held them would either send tags the validator refuses or pretend to edit what it cannot.
 */
export const detailsOf = (recipe: DetailedRecipe): EditorDetails => ({
  tags: recipe.tags.filter(_isAuthored),
  equipments: [...recipe.equipments],
  difficulty: recipe.difficulty,
  cuisine: recipe.cuisine,
  timings: { ...recipe.timings },
});

/** The tags the editor shows locked: read off the ingredients, never set by hand. */
export const computedTagsOf = (tags: Tag[]): ComputedTag[] =>
  tags.filter((tag): tag is ComputedTag => !_isAuthored(tag));

const _sameSet = <T>(a: readonly T[], b: readonly T[]) =>
  a.length === b.length && a.every((entry) => b.includes(entry));

/**
 * Whether the form still says what the row says — feeds the editor's `isEdited`.
 *
 * Order-insensitive on the two arrays: a chip turned off and on again moves to the end of the list,
 * and a save button that lit up for that would be offering to write what is already there.
 */
export const sameDetails = (a: EditorDetails, b: EditorDetails): boolean =>
  _sameSet(a.tags, b.tags) &&
  _sameSet(a.equipments, b.equipments) &&
  a.difficulty === b.difficulty &&
  a.cuisine === b.cuisine &&
  a.timings.preparation === b.timings.preparation &&
  a.timings.cooking === b.timings.cooking &&
  a.timings.resting === b.timings.resting;

/** A bare number, optionally followed by a minute word: `30`, `30 min`, `30m`. */
const MINUTES_ONLY = /^(\d+)\s*(?:m|mn|min|mins|minute|minutes)?$/;

/**
 * Hours, then optional minutes: `1h`, `1h30`, `1 h 30`, `1h30min`, `2 hours`. The colon form is
 * the same shape with the minutes required, since `1:` is nobody's way of writing an hour.
 */
const HOURS_AND_MINUTES = /^(\d+)\s*(?:(h|hr|hrs|hour|hours|heure|heures)|(:))\s*(?:(\d{1,2})\s*(?:m|mn|min|mins)?)?$/;

/**
 * What the cook typed, in minutes. Lenient by design — every one of these is something a real
 * person types into a box asking for a duration:
 *
 *   "30" · "30 min" · "30min" · "30m"     →  30
 *   "1h30" · "1 h 30" · "1H30" · "1:30"   →  90
 *   "1h" · "1h00" · "60"                  →  60
 *   "2h05"                                →  125
 *   "" · "0" · "-3" · "abc"               →  undefined
 *
 * No decimal hours. "1.5h" is not accepted and is not meant to be — it is the shape this parser
 * exists to spare the cook. A bare number is always minutes, which is what makes "30" unambiguous.
 * Past `MAX_TIMING_MINUTES` (a week), or `1h75`, is unparseable rather than clamped: the field reverts.
 */
export const minutesOf = (text: string): number | undefined => {
  const typed = text.trim().toLowerCase();

  const minutesOnly = MINUTES_ONLY.exec(typed);
  const hoursAndMinutes = minutesOnly ? null : HOURS_AND_MINUTES.exec(typed);

  let minutes: number | undefined;

  if (minutesOnly) minutes = Number(minutesOnly[1]);
  else if (hoursAndMinutes) {
    const [, hours, , colon, rest] = hoursAndMinutes;
    if (colon && rest === undefined) return undefined;

    const past = rest === undefined ? 0 : Number(rest);
    if (past >= 60) return undefined;

    minutes = Number(hours) * 60 + past;
  }

  return minutes !== undefined && minutes > 0 && minutes <= MAX_TIMING_MINUTES ? minutes : undefined;
};

/**
 * The same duration split for display. Returns the parts, not a string: the word for "min" is a
 * translation and this file takes no i18n import.
 *
 *   90 → { hours: 1, minutes: 30 }   ·   45 → { hours: 0, minutes: 45 }   ·   undefined → undefined
 */
export const durationOf = (minutes: number | undefined) =>
  minutes === undefined ? undefined : { hours: Math.floor(minutes / 60), minutes: minutes % 60 };

/**
 * The canonical text a duration field rewrites itself to on blur: `1h30` at or above an hour, `1h`
 * on the hour, `45 min` below it, empty for "not stated".
 *
 * Here rather than in the field because the round trip is the contract — `minutesOf` of this text
 * must give the same number back, or blurring twice would drift — and that is only testable where
 * both halves live. `minuteWord` is the translated `min`; `h` is the same in every locale we ship.
 */
export const durationTextOf = (minutes: number | undefined, minuteWord: string): string => {
  const parts = durationOf(minutes);
  if (!parts) return "";
  if (parts.hours === 0) return `${parts.minutes} ${minuteWord}`;
  if (parts.minutes === 0) return `${parts.hours}h`;

  return `${parts.hours}h${String(parts.minutes).padStart(2, "0")}`;
};
