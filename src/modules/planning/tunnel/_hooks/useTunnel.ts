import { useAtom } from "jotai";
import { router, usePathname } from "expo-router";
import { useCallback, useEffect, useRef } from "react";

import { MEAL_SLOTS, type MealSlot } from "../../_model/model";
import { daysAtom, dietsAtom, draftMealsAtom, noteAtom, peopleAtom, slotsAtom, utensilsAtom } from "../../_hooks/atoms";

/**
 * The tunnel in order. The route *is* the step — deriving the number from the path rather than
 * holding a counter beside it means the two cannot disagree, and the hardware back button stays
 * correct for free.
 */
export const TUNNEL_STEPS = ["setup", "diet", "generating", "review", "groceries"] as const;

export type TunnelStep = (typeof TUNNEL_STEPS)[number];

const routeFor = (step: TunnelStep) => `/planning/new/${step}` as const;

const toggle = <T extends string>(list: T[], id: T): T[] =>
  list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];

export const useTunnel = () => {
  const path = usePathname();
  const [people, setPeople] = useAtom(peopleAtom);
  const [days, setDays] = useAtom(daysAtom);
  const [slots, setSlots] = useAtom(slotsAtom);
  const [note, setNote] = useAtom(noteAtom);
  const [utensils, setUtensils] = useAtom(utensilsAtom);
  const [diets, setDiets] = useAtom(dietsAtom);
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

  return {
    step: step + 1,
    total: TUNNEL_STEPS.length,
    people,
    days,
    slots,
    note,
    utensils,
    diets,
    meals,
    next,
    back,
    setPeople,
    setDays,
    setNote,
    setMeals,
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
    toggleUtensil: useCallback(
      (id: string) => setUtensils((current) => toggle(current, id)),
      [setUtensils],
    ),
    toggleDiet: useCallback(
      (id: string) => setDiets((current) => toggle(current, id)),
      [setDiets],
    ),
  };
};
