import { type Allergen } from "./allergens";
import { type Diet } from "./diets";
import { type ComputedTag } from "./tags";

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
 * ⚠️ **These are desires, not verdicts.** PRODUCT.md's first anti-goal is that the app is not a
 * calorie policeman, and `high-calorie` is the clearest evidence this set is not a ladder from bad
 * to good: it serves someone eating to gain weight exactly as `low-calorie` serves someone eating
 * to lose. Nothing may render one of these back at the cook as a judgement on what they made.
 */
export const NUTRITION_PREFERENCES = [
  "high-protein",
  "low-carb",
  "low-calorie",
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
 * ⚠️ **Enforced in the UI, not in the validator.** The stored column is a plain subset of
 * `NUTRITION_PREFERENCES`, because a validator that rejects the pair turns a stale row into a
 * write that fails rather than a screen that corrects itself. The screen ticking one unticks the
 * other is where this belongs; anything reading `seeks` should treat the pair as unsatisfiable
 * rather than assume it cannot occur.
 */
export const EXCLUSIVE_PREFERENCES = [
  "low-calorie",
  "high-calorie",
] as const satisfies readonly NutritionPreference[];

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
