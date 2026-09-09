/**
 * Which plates a planned day can hold, in the order a day is eaten.
 *
 * In `shared/` rather than in the planning module because both halves of the app now name them:
 * the setup step offers them to choose from, and `households.defaultSlots` stores the answer — and
 * a validator built from a copy in `src/` is not a validator, since `@convex/*` and `~/modules/*`
 * cannot see each other (ADR 0002, lint R3). One list, two importers.
 *
 * The order is the semantics in the small way that matters here: a day's plates are drawn in it,
 * so a slot switched off and back on lands where it was rather than at the end of the day.
 */
export const MEAL_SLOTS = ["lunch", "dinner"] as const;

export type MealSlot = (typeof MEAL_SLOTS)[number];

export const isMealSlot = (value: string): value is MealSlot =>
  MEAL_SLOTS.some((slot) => slot === value);
