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

/**
 * The local hour a slot is eaten at — the clock a cook is measured against, not a schedule.
 *
 * From 10 the day's lunch is the meal in progress, from 18 its dinner. Hard-coded for now: a
 * household eating at 13 and 20 is still nearer these than to the other slot, and a per-household
 * setting is a field nobody has asked for yet.
 */
export const SLOT_HOURS: Record<MealSlot, number> = { lunch: 10, dinner: 18 };

/**
 * How far, in hours, a plate's slot may be from now and still be the plate being cooked.
 *
 * Sixteen reaches yesterday's dinner from a cook at 8 the next morning, and tomorrow's lunch from
 * one at 18 tonight, without reaching a plate two days out — that one has not started.
 */
export const SLOT_REACH_HOURS = 16;
