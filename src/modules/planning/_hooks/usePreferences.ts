import { useAtom } from "jotai";
import { useCallback } from "react";

import type { Equipment } from "@shared/equipments";

import { toggle } from "../_model/model";
import { allergiesAtom, dietsAtom, equipmentsAtom } from "./atoms";

/**
 * The standing answers: what the household eats, what it must never eat, and what it can cook with.
 *
 * These three are the kitchen's profile rather than this week's mood — a vegetarian is vegetarian
 * next week too, and an air fryer does not leave the counter between runs. That is what makes them
 * worth a screen of their own outside the tunnel, and what makes the mood, focus and time steps
 * *not* belong here: those are answers to "this week", and a standing copy of them would be a
 * second source contradicting the one the tunnel just collected.
 *
 * The same atoms the tunnel's steps write, deliberately. The preferences sheet and the tunnel are
 * two doors onto one fact, so editing a diet here changes the step the next run opens with; held
 * separately the two would drift, and nothing would say which was the real answer.
 *
 * Still atoms rather than a Convex query: nothing persists them across a restart yet, and the swap
 * to `api.router.planning.*` lands in this file alone (ADR 0006).
 */
export const usePreferences = () => {
  const [diets, setDiets] = useAtom(dietsAtom);
  const [allergies, setAllergies] = useAtom(allergiesAtom);
  const [equipments, setEquipments] = useAtom(equipmentsAtom);

  return {
    diets,
    allergies,
    equipments,
    toggleDiet: useCallback((id: string) => setDiets((current) => toggle(current, id)), [setDiets]),
    /**
     * Uncapped, unlike the tunnel's tastes: an exclusion list that stops accepting entries hands
     * the user a week built around an allergy the app quietly dropped.
     */
    toggleAllergy: useCallback(
      (id: string) => setAllergies((current) => toggle(current, id)),
      [setAllergies],
    ),
    toggleEquipment: useCallback(
      (equipment: Equipment) => setEquipments((current) => toggle(current, equipment)),
      [setEquipments],
    ),
  };
};
