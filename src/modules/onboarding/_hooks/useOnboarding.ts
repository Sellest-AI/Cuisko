import { router, useNavigationContainerRef, usePathname } from "expo-router";
import { useAtom, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  OWN_TRANSPORT,
  canLeave,
  ONBOARDING_STEPS,
  PROGRESS_BAR_TOTAL,
  PROGRESS_TOTAL,
  introOf,
  nextOf,
  positionOf,
  progressOf,
  routeOf,
  stepOf,
  type OnboardingStep,
} from "../_model/steps";
import { doneStepsAtom, resetOnboardingAtom } from "./atoms";

/**
 * Where the onboarding stands, whether the step on screen may be left yet, and the ways out of it.
 *
 * Nothing here reaches the backend. The flow writes nothing about having been seen: every sign-in
 * from `/auth` walks it again (the `@limitation` on `AuthGate`), so there is no flag to set on the way out, and no
 * Skip either: the only way into the app is through the last step.
 */
export const useOnboarding = () => {
  const path = usePathname();
  const navigation = useNavigationContainerRef();

  /**
   * The last path that was a step, so a sheet pushed over the flow does not drop the progress bar
   * to nothing underneath it. Latched during render, as `useTunnel` does and for its reason: an
   * effect would let the off-flow path through for one render.
   */
  const [lastStep, setLastStep] = useState<OnboardingStep>(stepOf(path) ?? ONBOARDING_STEPS[0]);
  const current = stepOf(path);

  if (current && current !== lastStep) setLastStep(current);

  const step = current ?? lastStep;

  /**
   * The step this screen *is*, fixed when it mounts, and the only one its `complete` may mark.
   *
   * A step stays mounted under the ones it pushed, and `step` follows the path, so a screen whose
   * effect completes it (plan-recipe, once planned) would otherwise re-run on the next push and
   * mark *that* step done on arrival: the cooking session opened with its action already done.
   */
  const [ownStep] = useState(step);

  const [doneSteps, setDoneSteps] = useAtom(doneStepsAtom);
  const restart = useSetAtom(resetOnboardingAtom);

  /**
   * Read at call time, so `next` stays the same function across steps. A step stays mounted under
   * the one it pushed, and a `next` that changed with the step would re-run every effect a screen
   * keyed on it.
   */
  const stepRef = useRef(step);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  /**
   * The done steps, readable at call time for the same reason, and written the moment a step
   * completes rather than a render later: a screen that completes and moves on in one gesture (the
   * cooking session's last button) would otherwise be refused by a gate still reading the old list.
   */
  const doneRef = useRef(doneSteps);

  useEffect(() => {
    doneRef.current = doneSteps;
  }, [doneSteps]);

  /**
   * Out of the flow and into the app: home, with the assistant sheet risen over it.
   *
   * A reset rather than a push, so nothing of the onboarding is left to swipe back into, and home
   * sits *under* the sheet rather than being pushed after it: closing Cuisko shows home, not a
   * blank stack.
   */
  const finish = useCallback(() => {
    navigation.reset({
      index: 1,
      routes: [{ name: "index" }, { name: "(modals)", params: { screen: "assistant" } }],
    });
  }, [navigation]);

  /** Refused, not merely discouraged, while the step's action is not done: see `canLeave`. */
  const next = useCallback(() => {
    if (!canLeave(stepRef.current, doneRef.current)) return;

    const following = nextOf(stepRef.current);

    if (!following) return finish();

    router.push(routeOf(following));
  }, [finish]);

  return {
    step,
    /** The section this step opens, when it is an intro: the chrome words Continue for it. */
    intro: introOf(step),
    /** 1-based, the part of the flow this step is in: what the progress counts. */
    position: positionOf(step),
    /** How far the progress is filled: the sections finished (`progressOf`). */
    progress: progressOf(step, doneSteps),
    /** The notches `progress` counts up to: one more than the parts (`PROGRESS_BAR_TOTAL`). */
    progressTotal: PROGRESS_BAR_TOTAL,
    total: PROGRESS_TOTAL,
    isLast: nextOf(step) === null,
    /** Continue is live: the step asks for nothing, or its action is done. */
    canContinue: canLeave(step, doneSteps),
    /** The step draws its own way on, so the chrome's pill stays away until it is done. */
    hasOwnTransport: OWN_TRANSPORT.includes(step),
    /** The calling screen reports its own action done (`ownStep`). Repeating it is harmless. */
    complete: useCallback(() => {
      if (doneRef.current.includes(ownStep)) return;

      doneRef.current = [...doneRef.current, ownStep];
      setDoneSteps(doneRef.current);
    }, [ownStep, setDoneSteps]),
    /** Called by the first step, so a second walk through does not open with every action done. */
    restart,
    next,
    finish,
  };
};
