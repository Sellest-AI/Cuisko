import { atom } from "jotai";

import type { Equipment } from "@shared/equipments";
import type { NutritionPreference } from "@shared/preferences";
import type { Taste } from "@shared/tastes";

import type { Constraint } from "../_model/constraints";

import { MAX_DAYS, type CookingTime, type DraftMeal, type MealSlot, type PlannedMeal } from "../_model/model";
import { PLACEHOLDER_MEALS } from "./placeholders";

/**
 * What the tunnel OFFERS a household that has never answered.
 *
 * Not "the app's defaults" any more, and the distinction is the point of this slice: a household
 * that has answered is prefilled from `households`, and these four are what a household with
 * `undefined` in those columns is offered instead. That is the whole reason the columns are
 * optional rather than defaulted server-side — see `convex/schema/households.ts`. Guessing three
 * people at the table is a reasonable opening bid; recording it as the household's answer, on a
 * row nobody has ever filled in, is not.
 *
 * Named rather than written into the atoms below, so the seeding effect in `useTunnel` can fall
 * back to the same values the atom started on and there is one place that says what an unanswered
 * kitchen looks like.
 */
export const TUNNEL_OFFERS = {
  people: 2,
  /**
   * One day short of the full week, so the offer reads as an offer rather than as a ceiling: a
   * track already at its maximum gives the user nothing to discover, and the day they add is the
   * one that teaches them the slider moves at all.
   */
  days: MAX_DAYS - 1,
  /**
   * Lunch alone, not both plates. Planning a week of lunches is the job people arrive with, and
   * the second plate doubles the generated week for a household that never asked for it — so
   * dinner is a plate you add, not one you have to notice and remove.
   */
  slots: ["lunch"],
  equipments: ["oven", "microwave"],
} as const satisfies { people: number; days: number; slots: readonly MealSlot[]; equipments: readonly Equipment[] };

/**
 * What the tunnel has collected so far.
 *
 * A module-scoped atom rather than route params: the draft outlives each step's screen but not the
 * app, it holds arrays and objects that params would have to stringify, and nobody deep-links into
 * the middle of a tunnel.
 *
 * Seeded from the household when the planning seed lands, so the second run through the tunnel
 * opens on what the first one answered — see `isSetupSeededAtom`.
 */
export const peopleAtom = atom<number>(TUNNEL_OFFERS.people);

export const daysAtom = atom<number>(TUNNEL_OFFERS.days);

export const slotsAtom = atom<MealSlot[]>([...TUNNEL_OFFERS.slots]);

export const noteAtom = atom("");

/**
 * What the kitchen can do, in @shared/equipments' own words.
 *
 * `Equipment[]` rather than `string[]`: the ids used to be a hand-copied list of their own, and a
 * `string` is what let `"airfryer"` sit beside the vocabulary's `"air fryer"` without the compiler
 * having anything to say about it.
 */
export const equipmentsAtom = atom<Equipment[]>([...TUNNEL_OFFERS.equipments]);

/**
 * Whether this run has already taken the household's answers.
 *
 * A flag beside the four atoms rather than `null` in each of them, which is what `constraintsAtom`
 * does: those four have a value the setup step can draw from the first frame, so making them
 * nullable would push a fallback into every reader to express something only the seeding effect
 * cares about. The constraint list has no such value — an unseeded chip row is genuinely empty —
 * so the two guards are shaped differently on purpose.
 *
 * ⚠️ **It guards against re-seeding, not against seeding twice.** Every step reads `useTunnel`, so
 * the effect re-runs on each of them; without this, walking back to setup after ticking an
 * appliance would put the household's saved kitchen back over the answer just given.
 */
export const isSetupSeededAtom = atom(false);

/**
 * The one list the diet step draws: every diet and allergen, each carrying whether it is ticked
 * for this run and whose stored row holds it.
 *
 * `null` rather than an empty list, and the difference is load-bearing: the list is seeded from the
 * planning seed once that query lands, and `[]` would be indistinguishable from "seeded, nobody
 * constrains anything" — so a household's inherited constraints would be overwritten by the empty
 * list the tunnel opened on and never come back.
 *
 * Typed rather than `string[]`: the ids used to be a hand-written list with no relation to any
 * vocabulary, and `string` is what let a screen and a validator disagree in silence.
 */
export const constraintsAtom = atom<Constraint[] | null>(null);

/**
 * The craving this week is built around, in @shared/tastes' own words. Empty by default — a mood
 * nobody asked for is a week steered somewhere the user never pointed.
 *
 * `Taste[]` rather than `string[]`: the ids used to be invented in `placeholders.ts`, and a
 * `string` is what let `"one-pan"` sit beside the tag vocabulary's `"one-pot"` with nothing to
 * catch it — the same failure `equipmentsAtom` documents for `"airfryer"`.
 */
export const moodsAtom = atom<Taste[]>([]);

/**
 * What the caller is aiming for nutritionally — the `seeks` half of their stored preferences,
 * which the focus step now asks.
 *
 * ⚠️ **`null` until the seed lands, and the reason is `constraintsAtom`'s exactly.** This is a
 * STORED answer, not a weekly one, so the step opens on what the user last saved; `[]` would be
 * indistinguishable from "seeded, they want nothing", and a saved `high-protein` would be
 * overwritten by the empty list the tunnel opened on and never come back.
 *
 * That is also the line between this atom and `moodsAtom` above. A taste steers one week and is
 * cleared by `resetTunnelAtom`; a seek describes how a person eats, survives the run, and is
 * written back by `commitPreferences`. The two used to be one question asked in two vocabularies.
 */
export const seeksAtom = atom<NutritionPreference[] | null>(null);

/** How long there is to cook on an average evening. `any` until the user says otherwise. */
export const cookingTimeAtom = atom<CookingTime>("any");

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
export const draftMealsAtom = atom<DraftMeal[]>([]);

/** Rows the user says are already in the kitchen, so the list stops asking for them. */
export const ownedRowsAtom = atom<string[]>([]);

/**
 * The shuffle the generated week was drawn from, rolled once per run by the generating step.
 *
 * An atom rather than that step's own state because the run outlives it: `commit` stores the seed on
 * the plan, so the week can be drawn again — and the step that commits is two screens further on.
 * `null` means nothing has been generated yet, which is the one state where there is nothing to keep.
 */
export const shuffleSeedAtom = atom<number | null>(null);

/**
 * Empty the last run out before starting another.
 *
 * These atoms are module-scoped, so they outlive the tunnel that filled them. Without this, a
 * second run opens on the previous week's meals with its "Got it" boxes already ticked — the user
 * asked for a new plan and got the old one back.
 *
 * The weekly answers go with them: a mood is what the user felt like last Sunday, so a second run
 * that opens with it still ticked is steering this week by last week's craving — and the bar would
 * read "Next step" on a step nobody had answered.
 *
 * The standing three stay. Diet, allergies and utensils are the kitchen's profile rather than this
 * run's answers, and clearing them would make a user re-declare an allergy every single week.
 *
 * `seeks` goes back to `null` rather than to `[]`, which is the same distinction `constraintsAtom`
 * makes and for the same reason: it is a stored answer, so the next run must RE-READ it from the
 * server. Emptying it here would silently clear a preference on the next `commitPreferences`.
 */
export const resetTunnelAtom = atom(null, (_get, set) => {
  set(draftMealsAtom, []);
  set(ownedRowsAtom, []);
  set(shuffleSeedAtom, null);
  set(moodsAtom, []);
  set(seeksAtom, null);
  set(cookingTimeAtom, "any");
  /** Back to unseeded, so the next run re-reads the household rather than reusing last week's ticks. */
  set(constraintsAtom, null);
  set(isSetupSeededAtom, false);
});
