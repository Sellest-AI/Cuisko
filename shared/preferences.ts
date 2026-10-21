import { type Allergen } from "./allergens";
import { type Diet } from "./diets";
import { type Equipment } from "./equipments";
import { type MealSlot } from "./mealSlots";
import { type ComputedTag, type Tag } from "./tags";

/**
 * The nutrition tags a person can ASK FOR — the `seeks` half of a user's preferences.
 *
 * A strict subset of [`COMPUTED_TAGS`](./tags.ts), and it has to be: a preference is only useful
 * if there is a tag on the recipe for it to match, so a value here that no recipe can carry is a
 * filter that returns nothing forever. The `satisfies` below is what holds that — a typo, or a tag
 * renamed in `tags.ts`, is a compile error rather than an empty result set.
 *
 * Why a separate list rather than filtering `COMPUTED_TAGS` at the call site: the other six
 * computed tags are diet and free-from claims, and those are already answered by `diet` and
 * `avoids` on the same row. Offering them here would be the same question asked twice, in a
 * vocabulary that aggregates differently — see the plan's aggregation table.
 *
 * `high-fibre` and `iron-rich` are the two most recently added, and they arrived from the opposite
 * direction to the rest: they were cravings on the tunnel's old focus list, asserted by whoever
 * wrote the recipe. They are measured now — fibre against the EU claim, iron against 30% of its
 * NRV (see `nutritionTagsOf`) — which is what made them fit to be sought rather than merely wished
 * for. A preference is only honest if something can check it.
 *
 * ⚠️ **These are desires, not verdicts.** PRODUCT.md's first anti-goal is that the app is not a
 * calorie policeman, and `high-calorie` is the clearest evidence this set is not a ladder from bad
 * to good: it serves someone eating to gain weight exactly as `low-calorie` serves someone eating
 * to lose. Nothing may render one of these back at the cook as a judgement on what they made.
 */
export const NUTRITION_PREFERENCES = [
  "high-protein",
  "low-calorie",
  "low-carb",
  "high-fibre",
  "iron-rich",
  "high-calorie",
] as const satisfies readonly ComputedTag[];

export type NutritionPreference = (typeof NUTRITION_PREFERENCES)[number];

/**
 * The pair that cannot both be sought.
 *
 * Wanting a light meal and a substantial one is not a filter, it is a contradiction — and the two
 * tags are mutually exclusive on the recipe as well (500 kcal against 850, see `nutritionTagsOf`),
 * so a row holding both would match nothing at all.
 *
 * @limitation Design choice: **enforced in the UI, not in the validator.** The stored column is a
 * plain subset of `NUTRITION_PREFERENCES`, because a validator that rejects the pair turns a stale
 * row into a write that fails rather than a screen that corrects itself. The screen ticking one
 * unticks the other is where this belongs; anything reading `seeks` should treat the pair as
 * unsatisfiable rather than assume it cannot occur.
 */
export const EXCLUSIVE_PREFERENCES = [
  "low-calorie",
  "high-calorie",
] as const satisfies readonly NutritionPreference[];

/**
 * The most goals the catalog import asks `suggestDishes` for at once. Two is the intersection a
 * cook actually stacks ("high-protein and low-carb"); three is a dish the model invents rather than
 * one Marmiton holds. A cook may seek more: this caps the import's ask, not the preference.
 */
export const MAX_CONSTRAINT_SEEKS = 2;

/**
 * Whether a recipe carrying `tags` is what someone seeking `seeks` asked for.
 *
 * Every sought tag must be present — "high-protein and low-carb" means both, and a recipe that
 * fits one of them is not what was asked. Nothing sought matches everything, so an unanswered
 * focus step leaves the pool as it was.
 *
 * ⚠️ **A recipe with no nutrition tags matches nothing sought.** This is the opposite of the
 * untimed-recipe rule in `candidatePool`, and both are honest to what absence means in their
 * field: an untimed recipe is one nobody timed, but a recipe without `high-protein` is one
 * `computeTags` either measured and found wanting, or refused to claim — and either way it is not
 * high-protein. The exclusive pair needs no branch here: no recipe carries both (500 kcal against
 * 850, see `nutritionTagsOf`), so seeking both matches nothing, which is what a contradiction
 * should do.
 */
export const matchesSeeks = (tags: readonly Tag[], seeks: readonly NutritionPreference[]): boolean =>
  seeks.every((sought) => tags.includes(sought));

/**
 * One person's answers — what `save` writes and what a screen holds while they are being edited.
 *
 * Here rather than beside the mutation that writes it, though the plan drew the seam there: the
 * preferences screen and the tunnel both hold this shape, and `@convex/*` does not resolve from
 * `src/` — only [`src/lib/convex/api.ts`](../src/lib/convex/api.ts) may reach the generated types
 * at all (ADR 0006, lint R3). `shared/` is the one place both halves already import from, and the
 * three fields are shared vocabularies to begin with.
 *
 * ⚠️ **Absence is not this type.** A user who has never answered has no row, which reads as
 * `omnivore` / `[]` / `[]` — see `convex/schema/preferences.ts`. This shape is what somebody
 * asserted, so a caller that cannot tell the two apart must read the row, not the values.
 */
export type PreferenceValues = {
  diet: Diet;
  avoids: Allergen[];
  seeks: NutritionPreference[];
};

/**
 * The set of constraints a table of eaters imposes between them.
 *
 * `avoids` is the union over the members and `diet` the strictest of theirs — see the aggregation
 * table in the plan, and `strictestDietOf` for why the two run in opposite directions. `seeks` is
 * deliberately absent: high-protein and low-calorie are not compatible wishes, so there is no
 * honest way to add two people's together.
 */
export type AggregatedConstraints = {
  diet: Diet;
  avoids: Allergen[];
};

/**
 * Everything the planning tunnel needs to open already answered.
 *
 * Three parts rather than one merged answer, because the screen has to say where each constraint
 * came from: what the caller ticks is written back to their own row, and what they inherit is
 * shown, applied, removable for the week, and never folded into "mine". A seed that had already
 * merged the two would make that distinction unrecoverable on the client.
 *
 * ⚠️ **`others` is a union, never a list of people.** It carries no name and no id, which is the
 * whole difference between reporting what a household cannot eat and reporting who cannot eat it.
 * An allergen is health data, and a member's identity is not the tunnel's to hand out.
 */
export type PlanningSeed = {
  /** The caller's own saved answers, or the defaults when they have never answered. */
  mine: PreferenceValues;
  /** Every OTHER member's constraints, already aggregated. Read-only in the tunnel. */
  others: AggregatedConstraints;
  household: {
    equipments?: Equipment[];
    defaultPeople?: number;
    defaultSlots?: MealSlot[];
    defaultDays?: number;
  };
};
