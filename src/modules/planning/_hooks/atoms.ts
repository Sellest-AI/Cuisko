import { atom } from "jotai";

import { MAX_DAYS, MEAL_SLOTS, type MealSlot, type PlannedMeal } from "../_model/model";
import { PLACEHOLDER_MEALS } from "./placeholders";

/**
 * What the tunnel has collected so far.
 *
 * A module-scoped atom rather than route params: the draft outlives each step's screen but not the
 * app, it holds arrays and objects that params would have to stringify, and nobody deep-links into
 * the middle of a tunnel. Placeholder until a mutation takes it (ADR 0006).
 */
export const peopleAtom = atom(3);

/** How far ahead to plan. A week is the offer the planning screen makes, so a week is the default. */
export const daysAtom = atom(MAX_DAYS);

/**
 * Which plates each of those days gets.
 *
 * Both by default: a household that only wants dinners planned is the exception, and starting from
 * the fuller week means the common case is answered by not touching this at all.
 */
export const slotsAtom = atom<MealSlot[]>([...MEAL_SLOTS]);

export const noteAtom = atom("");

export const utensilsAtom = atom<string[]>(["oven", "microwave"]);

export const dietsAtom = atom<string[]>(["pescatarian"]);

/**
 * The week the app is actually keeping: what the planning screen lists and what a plate edited
 * from it changes.
 *
 * State rather than the derivation the list used to rebuild per mount, because editing a plate is
 * the point — a pure function has nothing to write back to, so the swap sheet and the list would
 * be looking at two different weeks. Seeded from the placeholders; a later slice swaps the seed
 * for a Convex query and everything above this line stays as it is (ADR 0006).
 */
export const planMealsAtom = atom<PlannedMeal[]>(PLACEHOLDER_MEALS);

/**
 * Filled by the generating step, read by the review step, spent by the grocery step.
 *
 * Deliberately *not* `planMealsAtom`: a week the user is still reviewing has not been agreed to,
 * and writing the generation straight into the plan would replace a week they were keeping with
 * one they had not yet said yes to.
 *
 * Nothing hands it over yet — the last step dismisses to `/planning` and the draft is dropped on
 * the next run. Committing it is a question this slice does not answer: whether a generated week
 * replaces the plan or merges into the days it covers is a product call, not a plumbing one.
 */
export const draftMealsAtom = atom<PlannedMeal[]>([]);

/** Rows the user says are already in the kitchen, so the list stops asking for them. */
export const ownedRowsAtom = atom<string[]>([]);

/**
 * Empty the last run out before starting another.
 *
 * These atoms are module-scoped, so they outlive the tunnel that filled them. Without this, a
 * second run opens on the previous week's meals with its "Got it" boxes already ticked — the user
 * asked for a new plan and got the old one back.
 */
export const resetTunnelAtom = atom(null, (_get, set) => {
  set(draftMealsAtom, []);
  set(ownedRowsAtom, []);
});
