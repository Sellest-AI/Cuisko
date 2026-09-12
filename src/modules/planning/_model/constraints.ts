/**
 * The one list the tunnel's diet step draws, and the whole toggle table as pure functions.
 *
 * Framework-free — no React, no Jotai, no Convex (see `src/modules/AGENTS.md`) — because the four
 * cases below are the contract this slice is built on and a contract wants unit tests, not a
 * render tree.
 *
 * **One list, not two.** An earlier design split "mine" from "this week" and made the user answer
 * the same question twice. What a cook actually thinks about is what constrains this week; where
 * each constraint came from is a caption on the chip, and it is what decides where a toggle lands.
 */

import { ALLERGENS, sortAllergens, type Allergen } from "@shared/allergens";
import { DIETS, strictestDietOf, type Diet } from "@shared/diets";
import type { AggregatedConstraints, PreferenceValues } from "@shared/preferences";

/**
 * What one chip can stand for: a diet, or an allergen to avoid.
 *
 * The two vocabularies do not overlap, which is what lets a single list hold both and sort them
 * back out on the way to `save` — see `isDietConstraint`.
 */
export type ConstraintValue = Diet | Allergen;

/** Whose stored row holds this constraint. `undefined` means nobody has ticked it. */
export type ConstraintSource = "mine" | "inherited" | "both";

export type Constraint = {
  value: ConstraintValue;
  source?: ConstraintSource;
  /** Ticked for this run. False for an inherited one the caller dropped for the week. */
  active: boolean;
};

/**
 * `omnivore` is not a constraint, so it is never a *stored* one.
 *
 * Every other diet excludes something and reads as an instruction to the generator; `omnivore`
 * excludes nothing, and it is already what an empty list of ticks means — see `_dietOf`. So it
 * stays out of this list, and no row, no tick and no saved preference ever carries it.
 *
 * ⚠️ **It is drawn as a tile even so.** This list said "so it is not a chip" until UX tests with
 * real users, where an all-off diet grid read as unanswered rather than as answered-with-nothing
 * and people looked for the option that said so. The diet step therefore prepends a synthetic
 * `omnivore` tile that is selected exactly when no real diet is active, and tapping it unticks
 * the ones that are — see `tunnel/diet.tsx`. It is a view of the empty set, not a value: if you
 * are ever tempted to let it round-trip through `save`, that is the rule above, still standing.
 */
const CONSTRAINING_DIETS = DIETS.filter((diet) => diet !== "omnivore");

/**
 * Which of the two vocabularies a chip's value came from.
 *
 * Exported because the screen splits the one list into a diet row and an avoid row to label them,
 * and a second `DIETS.includes` at the call site is a copy of the rule that decides where a saved
 * value lands. The two vocabularies do not overlap, so membership is the whole answer.
 */
export const isDietConstraint = (value: ConstraintValue): value is Diet =>
  (CONSTRAINING_DIETS as readonly string[]).includes(value);

/**
 * Which of the two rows hold `value`, or `undefined` when neither does.
 *
 * The caller's own answer and the household's union are read separately and never merged, because
 * the difference is the whole toggle table: unticking something that is only inherited must leave
 * the housemate's row alone, and unticking something that is also mine must not.
 */
const _sourceOf = (isMine: boolean, isInherited: boolean): ConstraintSource | undefined => {
  if (isMine && isInherited) return "both";
  if (isMine) return "mine";
  if (isInherited) return "inherited";

  return undefined;
};

/**
 * The full list a run opens on, in each vocabulary's own order.
 *
 * Every value is present, ticked or not, rather than only the constrained ones: the step is where
 * a constraint is added as well as dropped, and a list that only showed what was already ticked
 * would need a second affordance to reach the rest. The order is the vocabulary's, so a chip never
 * moves between renders or between runs.
 *
 * A chip is active exactly when somebody holds it. `others` is a union with no name attached, so
 * "inherited" is all this can ever say about a housemate's constraint, and it is all the screen
 * says.
 */
export const constraintsOf = (
  mine: PreferenceValues | AggregatedConstraints,
  others: AggregatedConstraints,
): Constraint[] => {
  const values: ConstraintValue[] = [...CONSTRAINING_DIETS, ...ALLERGENS];

  return values.map((value) => {
    const source = isDietConstraint(value)
      ? _sourceOf(mine.diet === value, others.diet === value)
      : _sourceOf(mine.avoids.includes(value), others.avoids.includes(value));

    return { value, source, active: source !== undefined };
  });
};

/**
 * One tap on one chip. Returns the next list and never mutates the one it was given.
 *
 * Two independent rules rather than a case per combination:
 *
 * > **The week always follows the visible tick.** Never a source check, never an exception.
 * > **Your row follows it too, but only for values that were yours.** Nobody else's row is ever
 * > written by anything that happens here.
 *
 * ⚠️ **Unticking an inherited constraint that is also yours clears it from your row too.** Three of
 * us are vegan, the other two are away, I untick — and I have recorded myself omnivore until I
 * re-tick. That is the accepted cost of the second rule: the alternative keeps my row when the
 * value is also inherited, which makes one gesture mean two different things depending on state
 * the caller cannot see. The household self-corrects, because the others still hold vegan and next
 * week's seed brings it back as inherited.
 *
 * ⚠️ **An inherited chip left alone never enters your row.** That is what stops a member
 * inheriting a housemate's answer by pressing next, and it is why there is no conditional write
 * path: ticking is the only thing that ever saves, so what reaches `save` is exactly what the
 * caller asserted.
 */
export const toggleConstraint = (constraints: Constraint[], value: ConstraintValue): Constraint[] =>
  constraints.map((constraint) => {
    if (constraint.value !== value) return constraint;

    /** Switching off: out of the week whatever the source, and out of my row if it was ever in it. */
    if (constraint.active) {
      return {
        value,
        source: constraint.source === "inherited" || constraint.source === "both" ? "inherited" : undefined,
        active: false,
      };
    }

    /** Switching on: into the week, and into my row — which is the only thing that ever writes. */
    return {
      value,
      source: constraint.source === "inherited" ? "both" : "mine",
      active: true,
    };
  });

const _dietOf = (constraints: Constraint[]): Diet =>
  strictestDietOf(constraints.map((constraint) => constraint.value).filter(isDietConstraint));

const _avoidsOf = (constraints: Constraint[]): Allergen[] =>
  sortAllergens(constraints.map((constraint) => constraint.value).filter((value) => !isDietConstraint(value)));

/** Everything the caller has asserted about themselves: ticked, and theirs. */
const _mine = (constraint: Constraint) =>
  constraint.active && (constraint.source === "mine" || constraint.source === "both");

/**
 * What `save` is handed at the end of the tunnel: the caller's own ticks, inheritance excluded.
 *
 * The diet is the strictest of the ticked ones rather than the last tapped, so two diet chips on
 * at once resolve the way a shared dish does. No tick at all is `omnivore`, which is
 * `strictestDietOf`'s identity and the same thing a missing row already reads as.
 */
export const mineOf = (constraints: Constraint[]): { diet: Diet; avoids: Allergen[] } => {
  const mine = constraints.filter(_mine);

  return { diet: _dietOf(mine), avoids: _avoidsOf(mine) };
};

/**
 * What the generator is handed: everything still ticked, whoever it came from.
 *
 * The difference from `mineOf` is the point of the whole file — this one respects a housemate's
 * gluten, and `mineOf` refuses to record it as mine.
 */
export const runConstraintsOf = (constraints: Constraint[]): { diet: Diet; avoids: Allergen[] } => {
  const active = constraints.filter((constraint) => constraint.active);

  return { diet: _dietOf(active), avoids: _avoidsOf(active) };
};
