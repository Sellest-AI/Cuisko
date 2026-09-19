import type { Doc } from "@convex/_generated/dataModel";
import type { Clock } from "@shared/clock";
import { MEAL_SLOTS, SLOT_HOURS, SLOT_REACH_HOURS, type MealSlot } from "@shared/mealSlots";

/** A plate as this needs to see it: where it sits in the week and whether it is still ahead. */
export type PlateCandidate = Pick<Doc<"plannedMeals">, "_id" | "date" | "slot" | "status">;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The slot the clock says is in progress today, or `undefined` before lunch has started.
 *
 * The thresholds are `SLOT_HOURS`, read as the start of each slot: a slot is current from its hour
 * until the next one's. Walked from the last slot back so the latest started wins. Exported for the
 * cook nobody planned, which has to be written on some slot and takes the one in progress.
 */
export const currentSlot = (hour: number): MealSlot | undefined =>
  [...MEAL_SLOTS].reverse().find((slot) => hour >= SLOT_HOURS[slot]);

/** Signed hours from now to a plate's nominal moment — negative for a plate already behind the cook. */
const _hoursAway = (plate: PlateCandidate, clock: Clock): number =>
  Math.round((plate.date - clock.today) / DAY_MS) * 24 + SLOT_HOURS[plate.slot] - clock.hour;

/**
 * The plate this cook settles, or `undefined` when none is close enough to be it.
 *
 * Two rules, in order. A plate on today's current slot is the one being cooked, whatever else the
 * week holds: pizza planned for lunch and for dinner, cooked at 16h, is lunch — people eat lunch
 * late, and the dinner plate is still ahead of them. Failing that, the nearest plate in time wins,
 * provided it is within `SLOT_REACH_HOURS` of now: a dinner cooked at one in the morning is last
 * night's dinner, a lunch cooked at 8 is today's. Ties go to the earlier plate, which is the one the
 * household has been waiting on longest.
 *
 * Only `planned` plates are candidates. A cooked plate has been settled; settling it again would
 * spend the cellar twice.
 */
export const nearestPlate = (candidates: PlateCandidate[], clock: Clock): PlateCandidate | undefined => {
  const planned = candidates.filter((plate) => plate.status === "planned");
  const current = currentSlot(clock.hour);

  const onCurrentSlot = planned.find((plate) => plate.date === clock.today && plate.slot === current);
  if (onCurrentSlot) return onCurrentSlot;

  return planned
    .map((plate) => ({ plate, away: _hoursAway(plate, clock) }))
    .filter(({ away }) => Math.abs(away) <= SLOT_REACH_HOURS)
    .sort((a, b) => Math.abs(a.away) - Math.abs(b.away) || a.away - b.away)[0]?.plate;
};
