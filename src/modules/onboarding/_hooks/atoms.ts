import { atom } from "jotai";

import { EMPTY_PANTRY, type Pantry } from "../_model/pantry";
import type { OnboardingStep } from "../_model/steps";

/**
 * The steps whose action the user has done on this walk through, so Continue stays up on a step
 * they come back to.
 *
 * An atom rather than state in the chrome, because the chrome draws Continue and the step's screen
 * is what knows the action is done.
 */
export const doneStepsAtom = atom<OnboardingStep[]>([]);

/**
 * The pretend kitchen, shared across steps: what screen 2 buys and screen 5 plans is still there
 * for the steps after. Never written anywhere: a new account would otherwise start with a cellar
 * holding food it never bought, the inaccuracy the app exists to avoid.
 */
export const pantryAtom = atom<Pantry>(EMPTY_PANTRY);

/** A new walk through starts from nothing: the atoms outlive the flow, a sign-out included. */
export const resetOnboardingAtom = atom(null, (_get, set) => {
  set(doneStepsAtom, []);
  set(pantryAtom, EMPTY_PANTRY);
});
