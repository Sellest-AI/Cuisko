import { useAtom } from "jotai";
import { router, usePathname } from "expo-router";
import { useCallback, useEffect, useRef } from "react";

import { MEAL_SLOTS, toggle, toggleTaste, type MealSlot } from "../../_model/model";
import {
  cookingTimeAtom,
  daysAtom,
  draftMealsAtom,
  focusesAtom,
  moodsAtom,
  noteAtom,
  peopleAtom,
  slotsAtom,
} from "../../_hooks/atoms";
import { usePreferences } from "../../_hooks/usePreferences";

/**
 * The tunnel in order. The route *is* the step — deriving the number from the path rather than
 * holding a counter beside it means the two cannot disagree, and the hardware back button stays
 * correct for free.
 */
export const TUNNEL_STEPS = [
  "setup",
  "time",
  "diet",
  "mood",
  "allergies",
  "focus",
  "utensils",
  "generating",
  "review",
  "groceries",
] as const;

export type TunnelStep = (typeof TUNNEL_STEPS)[number];

const routeFor = (step: TunnelStep) => `/planning/new/${step}` as const;

export const useTunnel = () => {
  const path = usePathname();
  /**
   * The standing three come from `usePreferences` rather than from atoms read again here: the
   * preferences sheet edits the same answers, and two hooks toggling one atom is two places for
   * the rule to drift. The tunnel's own steps keep calling these off `useTunnel`, so its surface
   * is unchanged.
   */
  const { diets, allergies, equipments, toggleDiet, toggleAllergy, toggleEquipment } = usePreferences();
  const [people, setPeople] = useAtom(peopleAtom);
  const [days, setDays] = useAtom(daysAtom);
  const [slots, setSlots] = useAtom(slotsAtom);
  const [note, setNote] = useAtom(noteAtom);
  const [moods, setMoods] = useAtom(moodsAtom);
  const [focuses, setFocuses] = useAtom(focusesAtom);
  const [cookingTime, setCookingTime] = useAtom(cookingTimeAtom);
  const [meals, setMeals] = useAtom(draftMealsAtom);

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

    /** Past the last step the tunnel is spent, so leave it rather than stacking another screen. */
    if (!following) return router.dismissTo("/planning");

    router.push(routeFor(following));
  }, []);

  const back = useCallback(() => {
    if (router.canGoBack()) return router.back();

    router.dismissTo("/planning");
  }, []);

  /**
   * The steps a user may walk past without answering, and the answer each is still waiting for.
   *
   * Here rather than in the bar that draws the label, because which steps are optional is a fact
   * about the tunnel and belongs beside the list that defines it — the bar draws chrome, and would
   * otherwise be branching on step names to decide a product question.
   */
  const optional: Partial<Record<TunnelStep, string[]>> = {
    allergies,
    mood: moods,
    focus: focuses,
  };

  const awaiting = optional[TUNNEL_STEPS[step]!];

  return {
    step: step + 1,
    total: TUNNEL_STEPS.length,
    people,
    days,
    slots,
    note,
    equipments,
    diets,
    allergies,
    moods,
    focuses,
    cookingTime,
    meals,
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
    toggleEquipment,
    toggleDiet,
    toggleAllergy,
    toggleMood: useCallback(
      (id: string) => setMoods((current) => toggleTaste(current, id)),
      [setMoods],
    ),
    toggleFocus: useCallback(
      (id: string) => setFocuses((current) => toggleTaste(current, id)),
      [setFocuses],
    ),
  };
};
