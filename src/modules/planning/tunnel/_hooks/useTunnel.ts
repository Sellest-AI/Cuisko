import { useAtom, useAtomValue } from "jotai";
import { router, usePathname } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Equipment } from "@shared/equipments";
import type { NutritionPreference } from "@shared/preferences";
import type { Taste } from "@shared/tastes";

import { api } from "~/lib/convex/api";
import { useMutation } from "~/lib/convex/client";

import { toggle } from "@shared/helpers";
import { MEAL_SLOTS, planAfter, startOfDay, toggleTaste, type MealSlot } from "../../_model/model";
import {
  constraintsOf,
  isDietConstraint,
  mineOf,
  toggleConstraint as toggleIn,
  type ConstraintValue,
} from "../../_model/constraints";
import { resolveSeeks } from "../../_model/preferences";
import {
  constraintsAtom,
  cookingTimeAtom,
  daysAtom,
  draftMealsAtom,
  equipmentsAtom,
  isHouseholdSeededAtom,
  moodsAtom,
  noteAtom,
  peopleAtom,
  planAfterAtom,
  planDatesAtom,
  seeksAtom,
  slotsAtom,
} from "../../_hooks/atoms";
import { usePlanningSeed } from "./usePlanningSeed";

/**
 * Every step the tunnel can draw, in order. What a step *is* — its screen, its route, its chrome —
 * is keyed on this list, so a step parked below keeps compiling and stays one line from returning.
 */
const _ALL_STEPS = [
  "time",
  "week",
  "diet",
  "allergies",
  "mood",
  "focus",
  "utensils",
  "generating",
  "review",
  "groceries",
] as const;

export type TunnelStep = (typeof _ALL_STEPS)[number];

/**
 * Steps that exist but are not walked.
 *
 * @limitation `mood` is parked: the moods it collects reach no query or mutation yet, so asking
 * would be a question whose answer changes nothing about the week. Its screen and route stay; it
 * comes back by leaving this list.
 */
const _PARKED_STEPS: readonly TunnelStep[] = ["mood"];

/**
 * The tunnel in order, as the user walks it. The route *is* the step — deriving the number from
 * the path rather than holding a counter beside it means the two cannot disagree, and the hardware
 * back button stays correct for free.
 */
export const TUNNEL_STEPS = _ALL_STEPS.filter((step) => !_PARKED_STEPS.includes(step));

export const routeFor = (step: TunnelStep) => `/planning/new/${step}` as const;

const _isStepPath = (path: string) => TUNNEL_STEPS.some((step) => path.endsWith(`/${step}`));

export const useTunnel = () => {
  const rawPath = usePathname();

  /**
   * The last path that *was* a step, so a screen pushed over the tunnel does not collapse it.
   *
   * The tunnel opens routes that are not steps — the plate sheet, the quantity editor — and this
   * hook stays mounted underneath them. Reading the live path there matches no step, which drops
   * the progress bar to nothing mid-run, so an off-tunnel path keeps reporting the step it was
   * pushed from.
   *
   * An allowlist and a latch, not a list of the routes to ignore: a denylist has to grow with
   * every screen the tunnel learns to open, and one nobody remembers to add is a silent reset.
   * `TUNNEL_STEPS` already knows what a step is.
   *
   * Latched during render rather than in an effect, because an effect lands a render too late:
   * the off-tunnel path would already be current, would latch itself, and the guard would hold
   * for exactly one render. Nothing here waits on the state either — a step path is read straight
   * off `rawPath`, and the setter only records it for the render where it is gone.
   */
  const isStepPath = _isStepPath(rawPath);
  const [lastStepPath, setLastStepPath] = useState(rawPath);

  if (isStepPath && lastStepPath !== rawPath) setLastStepPath(rawPath);

  const path = isStepPath ? rawPath : lastStepPath;

  const [people, setPeople] = useAtom(peopleAtom);
  const [days, setDays] = useAtom(daysAtom);
  const [slots, setSlots] = useAtom(slotsAtom);
  const [note, setNote] = useAtom(noteAtom);
  const [moods, setMoods] = useAtom(moodsAtom);
  const [seeks, setSeeks] = useAtom(seeksAtom);
  const [cookingTime, setCookingTime] = useAtom(cookingTimeAtom);
  const [equipments, setEquipments] = useAtom(equipmentsAtom);
  const [constraints, setConstraints] = useAtom(constraintsAtom);
  const [isHouseholdSeeded, setHouseholdSeeded] = useAtom(isHouseholdSeededAtom);
  const [meals, setMeals] = useAtom(draftMealsAtom);
  const [after, setAfter] = useAtom(planAfterAtom);
  const dates = useAtomValue(planDatesAtom);

  const { seed, lastDate, householdId, isLoading: isSeedLoading } = usePlanningSeed();

  const { mutate: savePreferences } = useMutation(api.router.preferences.save.authed);
  const { mutate: saveDefaults } = useMutation(api.router.households.saveDefaults.authed);

  /**
   * The constraint list, seeded once per run from what the household already said.
   *
   * Guarded on `null` rather than on emptiness: seeding a second time would discard whatever the
   * user has ticked since, and every re-render of a step that reads this hook re-runs the effect.
   * `resetTunnelAtom` puts it back to `null` when the tunnel is entered, which is what makes the
   * *next* run re-read rather than reuse.
   */
  useEffect(() => {
    if (!seed || constraints !== null) return;

    setConstraints(constraintsOf(seed.mine, seed.others));
  }, [seed, constraints, setConstraints]);

  /**
   * The focus step's answer, seeded once per run from the caller's own saved `seeks`.
   *
   * `null` and not emptiness is the guard, for the reason the constraint list above gives: every
   * step reads this hook, so the effect re-runs on each of them, and a second seeding would put
   * the saved answer back over a chip the user just unticked. `resetTunnelAtom` returns it to
   * `null` so the next run re-reads rather than reuses.
   *
   * ⚠️ **`seed.mine.seeks` alone — never the household's.** `seeks` is the one field
   * `getPlanningSeed` refuses to aggregate: high-protein and low-calorie are not compatible
   * wishes, so there is no honest way to add two people's together. Whatever this step shows is
   * the caller's own and is written back to their own row.
   */
  useEffect(() => {
    if (!seed || seeks !== null) return;

    setSeeks(seed.mine.seeks);
  }, [seed, seeks, setSeeks]);

  /**
   * The household's four standing answers — the week step's three and the kitchen — seeded once
   * per run from what the household last said.
   *
   * ⚠️ **Each field is seeded only if it was answered, and `undefined` is what "unanswered" means.**
   * An absent column leaves the atom on `TUNNEL_OFFERS`, which is the tunnel's opening bid; a
   * column holding `[]` is an answer and overrides it. A household that unticked every appliance
   * gets an empty kitchen back, and one that has never run the tunnel gets the offer — the
   * distinction the optional columns exist for, and the reason `?? TUNNEL_OFFERS.x` is NOT what
   * this does.
   *
   * The one exception is an empty `defaultSlots`. `slotsAtom` documents that it never empties, and
   * the week step's `toggleSlot` upholds it, so `[]` can only arrive from a client that predates
   * that rule; taking it would leave the generating step sizing a week out of no plates at all.
   */
  useEffect(() => {
    if (!seed || isHouseholdSeeded) return;

    const { equipments: kitchen, defaultPeople, defaultSlots, defaultDays } = seed.household;

    if (kitchen) setEquipments(kitchen);
    if (defaultPeople !== undefined) setPeople(defaultPeople);
    if (defaultDays !== undefined) setDays(defaultDays);
    if (defaultSlots?.length) setSlots(defaultSlots);

    setHouseholdSeeded(true);
  }, [seed, isHouseholdSeeded, setHouseholdSeeded, setEquipments, setPeople, setDays, setSlots]);

  /**
   * The day the week counts from, seeded once per run from the household's latest kept plate.
   *
   * `null` is the guard, as for the answers above, and for a stronger reason: `getLastDate` is
   * reactive, so without the latch a plate kept from another device mid-review would move the whole
   * week under the user. `today` is taken at the latch and not before, so it is the day the answer
   * landed on. `resetTunnelAtom` puts it back to `null` for the next run.
   */
  useEffect(() => {
    if (lastDate === undefined || after !== null) return;

    setAfter(planAfter(startOfDay(new Date()), lastDate));
  }, [lastDate, after, setAfter]);

  const index = TUNNEL_STEPS.findIndex((step) => path.endsWith(`/${step}`));
  const step = index === -1 ? 0 : index;

  /**
   * The step, readable at call time rather than captured at render time.
   *
   * `next` has to be referentially stable, and keying it on `step` is what stops it being so: a
   * step's screen stays mounted underneath the one it pushed, so the next navigation re-renders it
   * with a new `step`, hands it a new `next`, and re-runs every effect depending on one. The
   * generating step schedules its advance from such an effect, so an unstable `next` had it
   * re-arming itself at each hop and running the rest of the tunnel on its own.
   */
  const stepRef = useRef(step);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const next = useCallback(() => {
    const following = TUNNEL_STEPS[stepRef.current + 1];
    const isGenerating = TUNNEL_STEPS[stepRef.current] === "generating";

    /** Past the last step the tunnel is spent, so leave it rather than stacking another screen. */
    if (!following) return router.dismissTo("/");
    if (isGenerating) return router.replace(routeFor(following));

    router.push(routeFor(following));
  }, []);

  /**
   * With nothing behind — a refresh, a shared link — the way out is home, not `/planning`: a
   * household with no plan yet is sent from there straight back into the tunnel, and leaving would
   * never land anywhere.
   */
  const back = useCallback(() => {
    if (router.canGoBack()) return router.back();

    router.dismissTo("/");
  }, []);

  /**
   * The steps a user may walk past without answering, and the answer each is still waiting for.
   *
   * Here rather than in the bar that draws the label, because which steps are optional is a fact
   * about the tunnel and belongs beside the list that defines it — the bar draws chrome, and would
   * otherwise be branching on step names to decide a product question.
   *
   * The allergy step reads the constraint list rather than an answer of its own: an exclusion the
   * caller inherited is one the step is no longer waiting for, so a household that already avoids
   * gluten does not offer to skip a question it has answered.
   */
  const optional: Partial<Record<TunnelStep, unknown[]>> = {
    allergies: (constraints ?? []).filter(
      (constraint) => constraint.active && !isDietConstraint(constraint.value),
    ),
    mood: moods,
    focus: seeks ?? [],
  };

  const awaiting = optional[TUNNEL_STEPS[step]!];

  /**
   * What the run leaves behind, written from the generating step at the end of the tunnel rather
   * than per step: a tunnel abandoned halfway has asserted nothing.
   *
   * Two writes because they have two owners — an allergy follows the person, an oven stays in the
   * kitchen. **Both fold into the generate mutation when that lands**, which is one round trip and
   * atomic with the generation; the logic is already in `convex/functions/`, so that move does not
   * reach back into this file beyond the two calls below.
   *
   * ⚠️ **`mineOf` and not the visible list.** What the caller ticked is theirs; what they inherited
   * is applied to the week, shown as a housemate's, and never written back as their own answer —
   * see the toggle table in `_model/constraints.ts`. `seeks` comes from the focus step, which asks
   * the caller directly and inherits nothing, so it needs no such filter.
   *
   * **The moods do not come here at all**, and that is the line this slice drew: a taste steers
   * this week and `resetTunnelAtom` clears it, while a seek describes how the caller eats and
   * survives the run. They used to be the same question — `high-protein` was a mood *and* a stored
   * preference — which meant one wish was persisted or discarded depending on which step it was
   * ticked in. See @shared/tastes.
   *
   * Nothing is written before the seed lands: `constraints` and `seeks` are both still `null`
   * then, and saving either would clear a row the user has not been shown yet.
   */
  const commitPreferences = useCallback(() => {
    if (!seed || !constraints || !seeks) return;

    const failed = (gesture: string) => (error: unknown) => {
      /**
       * Reported rather than surfaced: the plan the user is about to see is not wrong because the
       * preference write failed, and a modal over the generating step would be. It becomes a real
       * failure path the day this folds into the generate mutation and the two share a fate.
       */
      if (__DEV__) console.warn(`[useTunnel] ${gesture} failed`, error);
    };

    void savePreferences({ ...mineOf(constraints), seeks }).catch(failed("save"));

    if (householdId) {
      void saveDefaults({
        householdId,
        equipments,
        defaultPeople: people,
        defaultSlots: slots,
        defaultDays: days,
      }).catch(failed("saveDefaults"));
    }
  }, [seed, constraints, seeks, householdId, savePreferences, saveDefaults, equipments, people, slots, days]);

  return {
    step: step + 1,
    total: TUNNEL_STEPS.length,
    people,
    days,
    slots,
    note,
    equipments,
    moods,
    /** Empty until the seed lands, which `isSeedLoading` is how the focus step tells apart from "none". */
    seeks: seeks ?? [],
    cookingTime,
    /** Empty until the seed lands, which `isSeedLoading` is how a screen tells apart from "nothing". */
    constraints: constraints ?? [],
    meals,
    /** The days the week covers — what the draft asks for and the review draws, empty rows included. */
    dates,
    isSeedLoading,
    /**
     * Whether the step on screen is one the user may leave unanswered, and has. The bar reads it to
     * offer "Skip" instead of "Next step", so an optional step says so rather than looking like one
     * the user has failed to fill in.
     */
    skipping: awaiting?.length === 0,
    next,
    back,
    setPeople,
    setDays,
    setNote,
    setMeals,
    setCookingTime,
    commitPreferences,
    /**
     * Never empties: a plan with no meal in it is not a plan, so turning the last slot off is a
     * no-op rather than a state the generating step would have to defend against. Re-sorted into
     * `MEAL_SLOTS` order, so a slot switched off and back on does not reorder the days it fills.
     */
    toggleSlot: useCallback(
      (slot: MealSlot) =>
        setSlots((current) => {
          const next = toggle(current, slot);

          if (next.length === 0) return current;

          return MEAL_SLOTS.filter((candidate) => next.includes(candidate));
        }),
      [setSlots],
    ),
    toggleEquipment: useCallback(
      (equipment: Equipment) => setEquipments((current) => toggle(current, equipment)),
      [setEquipments],
    ),
    toggleMood: useCallback(
      (taste: Taste) => setMoods((current) => toggleTaste(current, taste)),
      [setMoods],
    ),
    /**
     * The exclusive pair is resolved by `resolveSeeks`, not here: `low-calorie` and `high-calorie`
     * cannot both be sought, the validator accepts the pair on purpose, and `_model/preferences.ts`
     * is the single enforcement point in the system. This screen and the preferences sheet call
     * the same function so the two cannot disagree.
     *
     * A no-op before the seed lands, so a tick cannot be taken and then overwritten by the seed.
     */
    toggleSeek: useCallback(
      (preference: NutritionPreference) =>
        setSeeks((current) => (current === null ? current : resolveSeeks(current, preference))),
      [setSeeks],
    ),
    /** A no-op before the seed lands, so a tick cannot be taken and then overwritten by the seed. */
    toggleConstraint: useCallback(
      (value: ConstraintValue) =>
        setConstraints((current) => (current === null ? current : toggleIn(current, value))),
      [setConstraints],
    ),
  };
};
